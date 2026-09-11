/**
 * "Measure a magnetar" — an interactive residual light-curve fit.
 * Loads data/chirp_grid.json (2500 nodes, 50x50 over B x P_spin) via
 * js/data.js's loadChirpGrid(), then lets two sliders drive a live
 * bilinear interpolation of the model curve and chi2 (data.js does the
 * actual interpolation; this module only draws and wires the controls).
 *
 * Canvas, not a chart library: the plot is simple enough (one line, one
 * error-barred scatter, a handful of gridlines) that a library's own
 * chrome would fight the site's restrained look more than it would
 * save code. Colors are read from the design tokens at draw-setup time
 * (cssColor(), below) rather than hardcoded, so the plot always matches
 * the current palette with no separate "chart theme" to keep in sync.
 *
 * observed.time (124 samples) and the model's own time axis (256
 * samples, `chirp.modelTime`) are DIFFERENT arrays — see js/data.js's
 * header. Each is plotted against its own x values; they are never
 * zipped together.
 */
import { loadChirpGrid } from './data.js';

function cssNum(name, el = document.documentElement) {
  return parseFloat(getComputedStyle(el).getPropertyValue(name));
}

function cssColor(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Standard "nice round number" tick-step chooser (Heckbert's algorithm). */
function niceNumber(range, round) {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * 10 ** exponent;
}

function niceTicks(min, max, tickCount) {
  const range = niceNumber(max - min || 1, false);
  const step = niceNumber(range / Math.max(1, tickCount - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) ticks.push(v);
  return { ticks, min: niceMin, max: niceMax };
}

/** Evaluates a CSS-style cubic-bezier(p1x,p1y,p2x,p2y) at progress x,
 *  via bisection on t — used so the snap animation eases exactly like
 *  --ease-weighty rather than an unrelated JS easing curve. */
function cubicBezierEase(p1x, p1y, p2x, p2y) {
  const bx = (t) => 3 * (1 - t) ** 2 * t * p1x + 3 * (1 - t) * t * t * p2x + t ** 3;
  const by = (t) => 3 * (1 - t) ** 2 * t * p1y + 3 * (1 - t) * t * t * p2y + t ** 3;
  return (x) => {
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      const d = bx(t) - x;
      if (Math.abs(d) < 1e-5) break;
      if (d > 0) hi = t; else lo = t;
      t = (lo + hi) / 2;
    }
    return by(t);
  };
}

export async function initMeasure() {
  const root = document.querySelector('[data-measure]');
  if (!root) return;

  const canvas = root.querySelector('[data-measure-canvas]');
  const canvasWrap = root.querySelector('[data-measure-canvas-wrap]');
  const pInput = root.querySelector('[data-measure-input="P"]');
  const bInput = root.querySelector('[data-measure-input="B"]');
  const pValueEl = root.querySelector('[data-measure-value="P"]');
  const bValueEl = root.querySelector('[data-measure-value="B"]');
  const chi2ValueEl = root.querySelector('[data-measure-chi2]');
  const fitBarEl = root.querySelector('[data-measure-fit-bar]');
  const snapBtn = root.querySelector('[data-measure-snap]');

  let chirp;
  try {
    chirp = await loadChirpGrid('data/chirp_grid.json');
  } catch (err) {
    console.warn('[measure] failed to load data/chirp_grid.json', err);
    return;
  }

  // --- Fixed axis domains, computed once so the plot never rescales
  // under the user while dragging (a rescaling axis reads as lag/jitter
  // even when the redraw itself is instant). ---
  const xMin = Math.min(chirp.modelTime[0], chirp.observed.time[0]);
  const xMax = Math.max(
    chirp.modelTime[chirp.modelTime.length - 1],
    chirp.observed.time[chirp.observed.time.length - 1],
  );

  // Fixed at [-1, 1] rather than fit to the data's own extremes: every
  // model curve in the whole grid stays within +/-0.5 mag, and only 3
  // of the 124 observed error bars reach past +/-1 at all — spending
  // vertical space on those three outliers' whisker tips shrank the
  // part of the plot that actually shows the chirp. draw() clips to
  // the plot rect, so those few whiskers are simply cut off cleanly at
  // the edge rather than overflowing into the tick labels.
  const yDomain = [-1, 1];
  const xTicks = niceTicks(xMin, xMax, 6);
  const yTicks = niceTicks(yDomain[0], yDomain[1], 5);
  const xDomain = [xTicks.min, xTicks.max];

  // The "goodness" bar is anchored to chi2 AT THE BEST FIT ITSELF
  // (bilinear-interpolated, same as every other point) rather than the
  // raw grid's minimum node chi2. Those two differ: best_fit_magnetar
  // sits inside a 50x50 cell that straddles a steep wall in chi2 (its
  // interpolated value is noticeably higher than the single nearest
  // grid node's own chi2), so normalizing against the grid's minimum
  // would make "Snap to best fit" itself read as a mediocre bar — the
  // opposite of the payoff it's supposed to deliver. Goodness is 1 at
  // that anchor by construction and falls off exponentially (chi2's
  // usual feel: differences near the minimum matter far more than the
  // same differences out in the tails) rather than linearly against
  // the grid's own noisy, corner-dominated max.
  const chi2Best = chirp.bilinearModel(chirp.bestFit.B, chirp.bestFit.P_spin).chi2;

  const weightyEase = cubicBezierEase(0.16, 1, 0.3, 1);

  const colors = {
    grid: cssColor('--line'),
    axis: cssColor('--text-faint'),
    tick: cssColor('--text-faint'),
    model: cssColor('--accent'),
    data: cssColor('--text-dim'),
  };

  const [pMin, pMax] = chirp.grid.P_spin_range;
  const [bMin, bMax] = chirp.grid.B_range;
  pInput.min = pMin;
  pInput.max = pMax;
  pInput.step = '0.01';
  bInput.min = bMin;
  bInput.max = bMax;
  bInput.step = '0.01';

  const state = { B: null, P: null, model: null, chi2: null };

  let dpr = Math.max(1, window.devicePixelRatio || 1);
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvasWrap.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    draw();
  }

  let fontReady = false;
  document.fonts?.ready?.then(() => { fontReady = true; draw(); });

  function draw() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const margin = { top: 12, right: 16, bottom: 28, left: 44 };
    const plotW = Math.max(1, w - margin.left - margin.right);
    const plotH = Math.max(1, h - margin.top - margin.bottom);

    const xScale = (t) => margin.left + ((t - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW;
    const yScale = (v) => margin.top + (1 - (v - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;

    const tickFont = `${fontReady ? '' : 'italic '}400 10px Geist, ui-sans-serif, system-ui, sans-serif`;

    // Gridlines (horizontal only — a quieter figure than a full grid).
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    yTicks.ticks.forEach((v) => {
      if (v < yDomain[0] || v > yDomain[1]) return;
      const y = Math.round(yScale(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();
    });

    // Axes.
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left + 0.5, margin.top);
    ctx.lineTo(margin.left + 0.5, margin.top + plotH + 0.5);
    ctx.lineTo(margin.left + plotW, margin.top + plotH + 0.5);
    ctx.stroke();

    // Tick labels.
    ctx.fillStyle = colors.tick;
    ctx.font = tickFont;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yTicks.ticks.forEach((v) => {
      if (v < yDomain[0] || v > yDomain[1]) return;
      ctx.fillText(v.toFixed(2), margin.left - 8, yScale(v));
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    xTicks.ticks.forEach((t) => {
      if (t < xDomain[0] || t > xDomain[1]) return;
      ctx.fillText(String(Math.round(t)), xScale(t), margin.top + plotH + 8);
    });

    // Everything data-shaped is clipped to the plot rect: the y domain
    // is fixed to [-1, 1] (see its declaration above) and a few of the
    // observed error bars' whiskers reach past that on purpose — this
    // just cuts them off cleanly at the axis rather than letting them
    // overflow into the tick labels or margin.
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, plotW, plotH);
    ctx.clip();

    if (state.model) {
      // Model curve.
      ctx.strokeStyle = colors.model;
      ctx.lineWidth = 1.75;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      chirp.modelTime.forEach((t, i) => {
        const x = xScale(t);
        const y = yScale(state.model[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Observed points + error bars.
    chirp.observed.time.forEach((t, i) => {
      const x = xScale(t);
      const resid = chirp.observed.residual[i];
      const err = chirp.observed.residualErr[i];
      ctx.strokeStyle = colors.data;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yScale(resid + err));
      ctx.lineTo(x, yScale(resid - err));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.data;
      ctx.beginPath();
      ctx.arc(x, yScale(resid), 1.6, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore(); // pop the clip
    ctx.restore();
  }

  let drawScheduled = false;
  function scheduleDraw() {
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => {
      drawScheduled = false;
      draw();
    });
  }

  function formatP(v) { return v.toFixed(2); }
  function formatB(v) { return v.toFixed(2); }

  function updateSliderFill(input) {
    const pct = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty('--measure-range-fill', `${pct}%`);
  }

  function setParams(B, P, { fromInputs = false } = {}) {
    state.B = B;
    state.P = P;
    const result = chirp.bilinearModel(B, P);
    state.model = result.ok ? result.model : null;
    state.chi2 = result.ok ? result.chi2 : null;

    if (!fromInputs) {
      pInput.value = String(P);
      bInput.value = String(B);
    }
    updateSliderFill(pInput);
    updateSliderFill(bInput);
    pValueEl.textContent = formatP(P);
    bValueEl.textContent = formatB(B);

    if (state.chi2 != null) {
      chi2ValueEl.textContent = state.chi2.toFixed(1);
      const goodness = Math.min(1, Math.exp(-(state.chi2 - chi2Best) / chi2Best));
      fitBarEl.style.width = `${(goodness * 100).toFixed(1)}%`;
      fitBarEl.style.opacity = String(0.45 + goodness * 0.55);
      root.classList.toggle('is-near-best', goodness > 0.95);
    } else {
      chi2ValueEl.textContent = '—';
      fitBarEl.style.width = '0%';
      root.classList.remove('is-near-best');
    }

    scheduleDraw();
  }

  pInput.addEventListener('input', () => {
    setParams(Number(bInput.value), Number(pInput.value), { fromInputs: true });
  });
  bInput.addEventListener('input', () => {
    setParams(Number(bInput.value), Number(pInput.value), { fromInputs: true });
  });

  let snapRaf = null;
  snapBtn.addEventListener('click', () => {
    if (snapRaf) cancelAnimationFrame(snapRaf);
    const from = { B: state.B, P: state.P };
    const to = { B: chirp.bestFit.B, P: chirp.bestFit.P_spin };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setParams(to.B, to.P);
      return;
    }
    const duration = cssNum('--duration-slow') * 1000 || 1200;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = weightyEase(t);
      setParams(
        from.B + (to.B - from.B) * eased,
        from.P + (to.P - from.P) * eased,
      );
      if (t < 1) {
        snapRaf = requestAnimationFrame(tick);
      } else {
        snapRaf = null;
      }
    };
    snapRaf = requestAnimationFrame(tick);
  });

  new ResizeObserver(() => resizeCanvas()).observe(canvasWrap);

  // Deliberately off from the best fit, so there is something to solve
  // before "Snap to best fit" delivers the reveal — see initMeasure's
  // header intent in the section's own copy.
  setParams(3.2, 11.5);
  root.hidden = false;
  resizeCanvas();
}
