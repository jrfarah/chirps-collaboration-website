"""Standalone loader for the SN 2024afav residual-chirp grid artifact.

Zero pipeline dependencies: stdlib only. The web app should use this read
path (or the same JSON layout) and never evaluate the physics.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def load(path):
    path = Path(path)
    with path.open() as fh:
        return json.load(fh)


def node_index(artifact, i_B, i_P):
    n_P = int(artifact['grid']['n_P'])
    return int(i_B) * n_P + int(i_P)


def node_at(artifact, B, P_spin):
    """Nearest-neighbour node to (B, P_spin)."""
    best, best_d = None, None
    for node in artifact['nodes']:
        dB = node['B'] - B
        dP = node['P_spin'] - P_spin
        d = dB * dB + dP * dP
        if best_d is None or d < best_d:
            best, best_d = node, d
    return best


def chi2_from_stored(node):
    """The frozen chi2. Not recomputed: the artifact is the model."""
    return node['chi2']


def curve_from_stored(artifact, node):
    """(time, model_residual) on the fixed output time array."""
    return artifact['time'], node['model']


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv:
        here = Path(__file__).resolve().parent
        argv = [str(here / 'chirp_grid_pilot.json')]
    artifact = load(argv[0])
    if len(argv) >= 3:
        node = node_at(artifact, float(argv[1]), float(argv[2]))
    else:
        n_B = int(artifact['grid']['n_B'])
        n_P = int(artifact['grid']['n_P'])
        node = artifact['nodes'][node_index(artifact, n_B // 2, n_P // 2)]
    t, model = curve_from_stored(artifact, node)
    chi2 = chi2_from_stored(node)
    print(f"schema     {artifact['schema']}")
    print(f"event      {artifact['event']}")
    print(f"B          {node['B']}")
    print(f"P_spin     {node['P_spin']}")
    print(f"chi2       {chi2}")
    print(f"n_time     {len(t)}")
    print(f"n_obs      {len(artifact['observed']['time'])}")
    print(f"curve[0:5] {model[:5]}")
    print(f"curve[-3:] {model[-3:]}")
    print(f"nuisances  {artifact['nuisances']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
