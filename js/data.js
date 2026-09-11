/**
 * Data layer for the SN 2024afav residual-chirp grid.
 *
 * Loads /data/chirp_grid_pilot.json (schema: chirps.sn2024afav.residual_grid.v1)
 * and exposes a clean, indexable view over it. This module never runs any
 * physics — the JSON artifact *is* the model; see demo/build_chirp_grid.py
 * for how it was generated and demo/load_chirp_grid.py for the reference
 * (Python) read path this mirrors.
 *
 * Important shape notes (do not assume these line up):
 *   - grid.time            : 256 samples, a dense array used for plotting model curves.
 *   - observed.time        : 124 samples, the actual observation epochs.
 *   - These are DIFFERENT arrays with different lengths and different
 *     spacing. node.model is sampled on grid.time, not observed.time.
 *   - nodes[] is a flat list in row-major (B, then P_spin) order:
 *     index = i_B * n_P + i_P. This module reshapes it into a 2D
 *     [i_B][i_P] table on load.
 *   - A node can be a failed physics solve: its model array may be all
 *     zero (or contain nulls) at grid corners where the forward path
 *     didn't converge. bilinearModel() detects this and excludes those
 *     corners rather than blending them in as if they were valid.
 */

const DEFAULT_URL = new URL('../data/chirp_grid_pilot.json', import.meta.url);

/**
 * A node's model array counts as "failed" if every sample is null/NaN,
 * or every sample is exactly zero (a converged-to-nothing solve reads
 * the same as a non-converged one for our purposes: neither is usable
 * signal to interpolate against).
 */
function isFailedNode(node) {
  if (!node || !Array.isArray(node.model)) return true;
  let sawNonZero = false;
  for (const v of node.model) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    if (v !== 0) sawNonZero = true;
  }
  return !sawNonZero;
}

/** Reshape the flat nodes[] list into a [i_B][i_P] table. */
function buildNodeTable(nodes, nB, nP) {
  const table = [];
  for (let iB = 0; iB < nB; iB++) {
    const row = [];
    for (let iP = 0; iP < nP; iP++) {
      const node = nodes[iB * nP + iP];
      row.push({ ...node, failed: isFailedNode(node) });
    }
    table.push(row);
  }
  return table;
}

/** Axis values read back off the table itself (not re-derived via
 *  linspace), so they exactly match what's stored, rounding included. */
function axesFromTable(table) {
  const bAxis = table.map((row) => row[0].B);
  const pAxis = table[0].map((node) => node.P_spin);
  return { bAxis, pAxis };
}

/** Index of the last axis value <= x, clamped to [0, axis.length - 2]. */
function lowerIndex(axis, x) {
  if (x <= axis[0]) return 0;
  if (x >= axis[axis.length - 1]) return axis.length - 2;
  let i = 0;
  while (i < axis.length - 2 && axis[i + 1] <= x) i++;
  return i;
}

/**
 * Fetch and parse the chirp grid artifact into a structure the rest of
 * the app can query without re-deriving shape assumptions each time.
 *
 * @param {string|URL} [url] - override for the JSON location (used by
 *   the test harness to point at a local dev server; defaults to the
 *   file shipped alongside this module).
 */
export async function loadChirpGrid(url = DEFAULT_URL) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`loadChirpGrid: fetch failed (${res.status} ${res.statusText}) for ${url}`);
  }
  const json = await res.json();

  const nB = json.grid.n_B;
  const nP = json.grid.n_P;
  const nodeTable = buildNodeTable(json.nodes, nB, nP);
  const { bAxis, pAxis } = axesFromTable(nodeTable);

  return {
    schema: json.schema,
    event: json.event,
    mechanism: json.mechanism,
    signConvention: json.sign_convention,
    fitSource: json.fit_source,
    nuisances: json.nuisances,
    bestFit: { ...json.best_fit_magnetar },
    precision: { ...json.precision },

    grid: {
      B_range: [...json.grid.B_range],
      P_spin_range: [...json.grid.P_spin_range],
      B_unit: json.grid.B_unit,
      P_spin_unit: json.grid.P_spin_unit,
      n_B: nB,
      n_P: nP,
      spacing: json.grid.spacing,
      bAxis,
      pAxis,
    },

    // The model curve's own time axis — 256 samples. Distinct from
    // observed.time (124 samples). Never zip these two together.
    modelTime: [...json.time],

    observed: {
      time: [...json.observed.time],
      residual: [...json.observed.residual],
      residualErr: [...json.observed.residual_err],
    },

    nodeTable,

    /** Node at exact grid position (i_B, i_P). */
    nodeAt(iB, iP) {
      return nodeTable[iB][iP];
    },

    /** Nearest node (by Euclidean distance in (B, P_spin) space) to a
     *  physical point — mirrors demo/load_chirp_grid.py:node_at(). */
    nearestNode(B, P_spin) {
      let best = null;
      let bestD = Infinity;
      for (const row of nodeTable) {
        for (const node of row) {
          const dB = node.B - B;
          const dP = node.P_spin - P_spin;
          const d = dB * dB + dP * dP;
          if (d < bestD) {
            bestD = d;
            best = node;
          }
        }
      }
      return best;
    },

    /**
     * Bilinear interpolation of the model curve and chi2 between the
     * four grid nodes surrounding (B, P_spin). Point is clamped to the
     * grid's covered range. Corners whose node failed to solve (see
     * isFailedNode) are excluded and the remaining corners' weights
     * are renormalized, rather than letting a zeroed-out corner drag
     * the interpolated curve toward zero. Returns `ok: false` only if
     * all four corners are unusable.
     */
    bilinearModel(B, P_spin) {
      const iB0 = lowerIndex(bAxis, B);
      const iP0 = lowerIndex(pAxis, P_spin);
      const iB1 = iB0 + 1;
      const iP1 = iP0 + 1;

      const bSpan = bAxis[iB1] - bAxis[iB0];
      const pSpan = pAxis[iP1] - pAxis[iP0];
      const tB = bSpan === 0 ? 0 : (B - bAxis[iB0]) / bSpan;
      const tP = pSpan === 0 ? 0 : (P_spin - pAxis[iP0]) / pSpan;

      const corners = [
        { node: nodeTable[iB0][iP0], w: (1 - tB) * (1 - tP) },
        { node: nodeTable[iB1][iP0], w: tB * (1 - tP) },
        { node: nodeTable[iB0][iP1], w: (1 - tB) * tP },
        { node: nodeTable[iB1][iP1], w: tB * tP },
      ];

      const valid = corners.filter((c) => !c.node.failed);
      const invalidCorners = corners
        .filter((c) => c.node.failed)
        .map((c) => ({ B: c.node.B, P_spin: c.node.P_spin }));

      if (valid.length === 0) {
        return {
          ok: false,
          model: null,
          chi2: null,
          degraded: true,
          invalidCorners,
        };
      }

      const weightSum = valid.reduce((s, c) => s + c.w, 0);
      // All corner weights are exactly zero only when the query point
      // sits precisely on a corner already excluded as failed; fall
      // back to an unweighted average of whatever's left rather than
      // dividing by zero.
      const norm = weightSum > 0
        ? valid.map((c) => c.w / weightSum)
        : valid.map(() => 1 / valid.length);

      const nSamples = valid[0].node.model.length;
      const model = new Array(nSamples).fill(0);
      let chi2 = 0;
      valid.forEach((c, i) => {
        const w = norm[i];
        chi2 += w * (c.node.chi2 ?? 0);
        for (let k = 0; k < nSamples; k++) {
          model[k] += w * (c.node.model[k] ?? 0);
        }
      });

      return {
        ok: true,
        model,
        chi2,
        degraded: invalidCorners.length > 0,
        invalidCorners,
      };
    },
  };
}
