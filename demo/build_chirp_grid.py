"""Build a frozen (B, P_spin) residual-chirp grid for the SN 2024afav demo.

The web app never runs physics: it loads the JSON artifact this script writes.
Generation reuses the published forward path as-is:

    JointLogProb.modulation
      -> model_period_curve('lense_thirring')
      -> wind_disk.r_of_t  (L_wind, P_wind = P_disk, truncation radius)
      -> P_LT_from_r
      -> phase = int 2 pi / P(t)
      -> dm = A0 exp[-((t-t_peak)/A1)^2] cos(phi + phi0)

Predicted residual is -dm (magnetar-model minus data). Intermediate physical
quantities are not stored.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

WEBSITE_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_ROOT = WEBSITE_ROOT.parent / 'chirps_package' / 'chirps'
MOSFIT_DIR = PIPELINE_ROOT / 'data' / 'mosfit'
EVENT_PATH = MOSFIT_DIR / 'SN2024afav_full.json'
RUN_DIR = MOSFIT_DIR / 'runs' / 'full'
JOINT_H5 = RUN_DIR / 'joint_nominal.h5'
RESONLY_H5 = RUN_DIR / 'resonly_lense_thirring.h5'

N_MAGNETAR = 7
CHIRP_DISK_NAMES = ('A0', 't_peak', 'A1', 'phi0', 'alpha', 'Mdot0_Msun_yr')
CHIRP_DISK_LOG = (False, False, False, False, False, True)
N_PLOT = 256
N_PREC_MAG = 4
N_PREC_T = 3
N_PREC_B = 4
N_PREC_P = 4
N_PREC_CHI2 = 3


def _best_from_backend(path: Path, burn_frac: float = 0.5):
    import emcee
    be = emcee.backends.HDFBackend(str(path))
    nsteps = int(be.iteration)
    discard = int(round(burn_frac * nsteps))
    chain = np.asarray(be.get_chain(discard=discard, flat=True), dtype=float)
    logp = np.asarray(be.get_log_prob(discard=discard, flat=True), dtype=float)
    finite = np.isfinite(logp)
    i = int(np.nanargmax(np.where(finite, logp, -np.inf)))
    return {
        'nsteps': nsteps,
        'nwalkers': int(be.shape[0]),
        'ndim': int(be.shape[1]),
        'best_theta': chain[i],
        'best_logp': float(logp[i]),
        'chain': chain,
        'logp': logp,
    }


def _physical_tail(theta, names, log_flags):
    out = {}
    for name, val, is_log in zip(names, theta, log_flags):
        out[name] = float(10.0 ** val if is_log else val)
    return out


def load_published_params(mm):
    """Best-fit nuisances from joint_nominal; B/P ranges from published priors."""
    joint = _best_from_backend(JOINT_H5)
    if joint['ndim'] != N_MAGNETAR + len(CHIRP_DISK_NAMES):
        raise RuntimeError(
            f'{JOINT_H5} ndim={joint["ndim"]}, expected '
            f'{N_MAGNETAR + len(CHIRP_DISK_NAMES)}')
    nuis = _physical_tail(
        joint['best_theta'][N_MAGNETAR:], CHIRP_DISK_NAMES, CHIRP_DISK_LOG)
    mag_phys = mm.to_physical(joint['best_theta'][:N_MAGNETAR])
    nuis['Bfield'] = float(mag_phys['Bfield'])
    nuis['Pspin'] = float(mag_phys['Pspin'])
    nuis['texplosion'] = float(mag_phys['texplosion'])
    nuis['variance'] = float(mag_phys['variance'])

    # MOSFiT prior box on the joint-fit magnetar (the published joint prior).
    mosfit_prior = {n: tuple(mm.bounds(n)) for n in ('Bfield', 'Pspin')}

    # Residual-only published prior: B14, T_ms as free mechanism parameters.
    from chirps.fullfit.residuals import FREE_MAGNETAR_BOUNDS
    resonly_prior = {
        'B14': tuple(FREE_MAGNETAR_BOUNDS['B14']),
        'T_ms': tuple(FREE_MAGNETAR_BOUNDS['T_ms']),
    }

    resonly = _best_from_backend(RESONLY_H5)
    resonly_names = CHIRP_DISK_NAMES + ('B14', 'T_ms')
    resonly_log = CHIRP_DISK_LOG + (False, False)
    resonly_best = _physical_tail(
        resonly['best_theta'], resonly_names, resonly_log)

    # Joint posterior support on (B, P_spin), from the magnetar cube columns.
    i_B = list(mm.free_names).index('Bfield')
    i_P = list(mm.free_names).index('Pspin')
    B_j = np.array([mm._params[i_B].value(x)
                    for x in joint['chain'][:, i_B]])
    P_j = np.array([mm._params[i_P].value(x)
                    for x in joint['chain'][:, i_P]])
    joint_post = {
        'Bfield': tuple(np.nanquantile(B_j, [0.16, 0.50, 0.84])),
        'Pspin': tuple(np.nanquantile(P_j, [0.16, 0.50, 0.84])),
        'B_minmax': (float(np.nanmin(B_j)), float(np.nanmax(B_j))),
        'P_minmax': (float(np.nanmin(P_j)), float(np.nanmax(P_j))),
    }
    return {
        'nuisances': nuis,
        'mosfit_prior': mosfit_prior,
        'resonly_prior': resonly_prior,
        'resonly_best': resonly_best,
        'joint_posterior': joint_post,
        'joint_logp': joint['best_logp'],
        'joint_nsteps': joint['nsteps'],
        'mag_cube': np.asarray(joint['best_theta'][:N_MAGNETAR], dtype=float),
    }


def make_log_prob():
    """Frozen-magnetar JointLogProb: the published residual forward path."""
    from chirps.fullfit.joint import JointFitConfig, JointLogProb, _build_param_spec
    from chirps.fullfit.residuals import FREE_MAGNETAR_BOUNDS, FREE_MAGNETAR_LOG

    free = ('alpha', 'Mdot0_Msun_yr', 'B14', 'T_ms')
    cfg = JointFitConfig(
        mechanism='lense_thirring',
        magnetar_mode='frozen',
        tie_magnetar=False,
        spindown_evolution=True,
        disk_free=free,
        disk_bounds={k: FREE_MAGNETAR_BOUNDS[k] for k in free},
        disk_log=dict(FREE_MAGNETAR_LOG),
        phase_nodes=96,
    )
    dummy = (np.array([0.0]), np.array([0.0]), np.array([1.0]))
    spec = _build_param_spec(cfg, None, sigma=0.0)
    return JointLogProb(cfg, model_spec=None, obs=dummy, param_spec=spec)


def predicted_residual(lp, t, chirp, disk):
    """residual = -dm, the overlay on magnetar-model minus data."""
    dm = lp.modulation(np.asarray(t, dtype=float), {}, chirp, disk)
    if dm is None:
        return None
    return -np.asarray(dm, dtype=float)


def chi2_of(obs, err, model):
    good = (np.isfinite(obs) & np.isfinite(err) & (err > 0)
            & np.isfinite(model))
    if not np.any(good):
        return float('nan')
    r = (obs[good] - model[good]) / err[good]
    return float(np.dot(r, r))


def observed_residuals(mm, mag_cube, variance):
    """Published residual definition: best-fit joint continuum minus data."""
    from chirps.fullfit.residuals import combine_residuals, explosion_mjd

    res_eval = mm.evaluate(mag_cube, grid=False)
    if res_eval is None:
        raise RuntimeError('MOSFiT failed to evaluate the joint-fit magnetar.')
    continuum = np.asarray(res_eval['obs'], dtype=float)
    phys = mm.to_physical(mag_cube)
    t_exp = explosion_mjd(mm, phys)
    err = np.hypot(mm.obs_err, float(variance))
    residuals = {
        'time_mjd': mm.obs_time,
        'phase_days': mm.obs_time - t_exp,
        'residual': continuum - mm.obs_mag,
        'residual_err': err,
        't_exp_mjd': t_exp,
    }
    binned = combine_residuals(residuals, bin_width=1.0, robust=True)
    return residuals, binned, t_exp


def round_list(values, nd):
    out = []
    for v in np.asarray(values, dtype=float).ravel():
        if not np.isfinite(v):
            out.append(None)
        else:
            out.append(round(float(v), nd))
    return out


def choose_grid_range(loaded):
    """Demo range: residual-only published prior, which is the prior on
    free (B, P_spin) in residual space. The joint MOSFiT posterior is too
    tight (~1% in B) for a slider to show a changing chirp.
    """
    B_lo, B_hi = loaded['resonly_prior']['B14']
    P_lo, P_hi = loaded['resonly_prior']['T_ms']
    return {
        'B': (float(B_lo), float(B_hi)),
        'P_spin': (float(P_lo), float(P_hi)),
        'source': (
            'prior: fit_residuals_free_magnetar FREE_MAGNETAR_BOUNDS '
            '(B14 0.1-5.0, T_ms 1.0-15.0). These are the priors used when '
            'B and P_spin vary in the residual chirp, the same forward path '
            'the demo evaluates. The joint-fit MOSFiT prior is wider still '
            'but is a prior on the continuum; the joint posterior is '
            'Bfield ~ 1.35 ± 0.014, Pspin ~ 4.73 ± 0.05 and is too tight '
            'for a demo slider.'
        ),
        'spacing': 'linear',
    }


def evaluate_node(lp, B, P_spin, chirp, disk_fixed, t_obs, t_plot, obs, err):
    disk = dict(disk_fixed)
    disk['B14'] = float(B)
    disk['T_ms'] = float(P_spin)
    t0 = time.perf_counter()
    model_obs = predicted_residual(lp, t_obs, chirp, disk)
    wall_obs = time.perf_counter() - t0
    t1 = time.perf_counter()
    model_plot = predicted_residual(lp, t_plot, chirp, disk)
    wall_plot = time.perf_counter() - t1
    if model_obs is None or model_plot is None:
        return None
    return {
        'B': float(B),
        'P_spin': float(P_spin),
        'model': model_plot,
        'chi2': chi2_of(obs, err, model_obs),
        'wall_s': wall_obs + wall_plot,
        'wall_obs_s': wall_obs,
        'wall_plot_s': wall_plot,
    }


def build_artifact(n_B: int, n_P: int, out_path: Path):
    from chirps.fullfit.mosfit_model import MosfitMagnetar

    print('=== constructing MosfitMagnetar (for continuum residuals + priors) ===')
    t_mm = time.perf_counter()
    mm = MosfitMagnetar(EVENT_PATH, output_path=RUN_DIR, quiet=True)
    print(f'  MosfitMagnetar in {time.perf_counter() - t_mm:.1f}s')
    print(f'  free_names = {mm.free_names}')

    loaded = load_published_params(mm)
    nu = loaded['nuisances']
    print('\n=== published joint_nominal best fit (loaded from chain) ===')
    print(f'  file: {JOINT_H5}  nsteps={loaded["joint_nsteps"]}  '
          f'best_logp={loaded["joint_logp"]:.3f}')
    for k in ('A0', 't_peak', 'A1', 'phi0', 'alpha', 'Mdot0_Msun_yr',
              'Bfield', 'Pspin', 'variance', 'texplosion'):
        print(f'  {k:16s} {nu[k]!r}')
    print(f'  log10 Mdot0     {np.log10(nu["Mdot0_Msun_yr"])!r}')
    print('\n=== MOSFiT prior (joint-fit magnetar block) ===')
    print(f'  Bfield {loaded["mosfit_prior"]["Bfield"]}')
    print(f'  Pspin  {loaded["mosfit_prior"]["Pspin"]}')
    print('\n=== residual-only prior (FREE_MAGNETAR_BOUNDS) ===')
    print(f'  B14 {loaded["resonly_prior"]["B14"]}')
    print(f'  T_ms {loaded["resonly_prior"]["T_ms"]}')
    print('\n=== residual-only best fit (same chain, for comparison) ===')
    for k, v in loaded['resonly_best'].items():
        print(f'  {k:16s} {v!r}')
    jp = loaded['joint_posterior']
    print('\n=== joint_nominal posterior (16/50/84) ===')
    print(f'  Bfield {jp["Bfield"]}  minmax={jp["B_minmax"]}')
    print(f'  Pspin  {jp["Pspin"]}  minmax={jp["P_minmax"]}')

    print('\n=== observed residuals (joint best-fit continuum − data) ===')
    t_res = time.perf_counter()
    raw, binned, t_exp = observed_residuals(mm, loaded['mag_cube'], nu['variance'])
    print(f'  unbinned {raw["residual"].size} points, '
          f'binned {binned["residual"].size} nights, '
          f't_exp MJD {t_exp:.4f}  ({time.perf_counter() - t_res:.1f}s)')

    t_obs = np.asarray(binned['phase_days'], dtype=float)
    obs = np.asarray(binned['residual'], dtype=float)
    err = np.asarray(binned['residual_err'], dtype=float)
    t_plot = np.linspace(float(t_obs.min()), float(t_obs.max()), N_PLOT)

    lp = make_log_prob()
    chirp = {k: nu[k] for k in ('A0', 't_peak', 'A1', 'phi0')}
    disk_fixed = {
        'alpha': nu['alpha'],
        'Mdot0_Msun_yr': nu['Mdot0_Msun_yr'],
    }

    print('\n=== forward-path cost (one evaluation) ===')
    t_cost = np.array([80.0, 120.0, 160.0])
    disk_bf = dict(disk_fixed)
    disk_bf['B14'] = nu['Bfield']
    disk_bf['T_ms'] = nu['Pspin']
    # warmup
    predicted_residual(lp, t_cost, chirp, disk_bf)
    times = []
    for _ in range(5):
        t0 = time.perf_counter()
        predicted_residual(lp, t_obs, chirp, disk_bf)
        times.append(time.perf_counter() - t0)
    print(f'  JointLogProb.modulation signature:')
    print('    modulation(t_phase, magnetar_physical, chirp, disk) -> dm')
    print('    disk supplies B14, T_ms when tie_magnetar=False')
    print(f'  phase_nodes={lp.config.phase_nodes}  (one r(t) root-find each)')
    print(f'  wall-time at {t_obs.size} observed samples: '
          f'median {np.median(times)*1e3:.1f} ms  '
          f'(min {np.min(times)*1e3:.1f}, max {np.max(times)*1e3:.1f})')

    # Confirm ChirpModel.from_mechanism is the same physics.
    from chirps.fullfit.chirp import ChirpModel
    mech_params = dict(disk_bf)
    cm = ChirpModel.from_mechanism(
        'lense_thirring', mech_params, spindown_evolution=True, n_nodes=96)
    dm_cm = cm.modulation(t_obs, **chirp)
    dm_lp = lp.modulation(t_obs, {}, chirp, disk_bf)
    max_diff = float(np.nanmax(np.abs(dm_cm - dm_lp)))
    print(f'  ChirpModel.from_mechanism vs JointLogProb.modulation: '
          f'max |dm| difference = {max_diff:.3e} mag')

    grid = choose_grid_range(loaded)
    B_axis = np.linspace(grid['B'][0], grid['B'][1], n_B)
    P_axis = np.linspace(grid['P_spin'][0], grid['P_spin'][1], n_P)
    print(f'\n=== {n_B}x{n_P} grid ===')
    print(f'  B      in {grid["B"]}   source: residual-only prior')
    print(f'  P_spin in {grid["P_spin"]}')

    nodes = []
    walls = []
    n_fail = 0
    verbose_nodes = (n_B * n_P) <= 16
    t_grid = time.perf_counter()
    for i_B, B in enumerate(B_axis):
        row_chi2 = []
        for P in P_axis:
            node = evaluate_node(
                lp, B, P, chirp, disk_fixed, t_obs, t_plot, obs, err)
            if node is None:
                n_fail += 1
                print(f'  FAIL B={B:.4f} P={P:.4f}')
                nodes.append({
                    'B': round(float(B), N_PREC_B),
                    'P_spin': round(float(P), N_PREC_P),
                    'chi2': None,
                    'model': [None] * N_PLOT,
                })
                continue
            walls.append(node['wall_s'])
            row_chi2.append(node['chi2'])
            if verbose_nodes:
                print(f'  B={B:7.4f}  P_spin={P:7.4f}  chi2={node["chi2"]:10.3f}  '
                      f'{node["wall_s"]*1e3:6.1f} ms')
            nodes.append({
                'B': round(float(B), N_PREC_B),
                'P_spin': round(float(P), N_PREC_P),
                'chi2': (None if not np.isfinite(node['chi2'])
                         else round(float(node['chi2']), N_PREC_CHI2)),
                'model': round_list(node['model'], N_PREC_MAG),
            })
        if not verbose_nodes:
            finite = [c for c in row_chi2 if np.isfinite(c)]
            chi2_bit = (f'chi2 {min(finite):.1f}–{max(finite):.1f}'
                        if finite else 'no finite chi2')
            print(f'  row {i_B+1:3d}/{n_B}  B={B:7.4f}  {chi2_bit}  '
                  f'elapsed {time.perf_counter() - t_grid:.1f}s',
                  flush=True)
    grid_wall = time.perf_counter() - t_grid
    print(f'  done: {len(nodes)} nodes, {n_fail} failures, {grid_wall:.1f}s')

    artifact = {
        'schema': 'chirps.sn2024afav.residual_grid.v1',
        'event': 'SN2024afav',
        'mechanism': 'lense_thirring',
        'sign_convention': (
            'observed residual is magnetar_model - data; each node.model is '
            'the predicted residual -dm, so a correct chirp overlays the data'
        ),
        'fit_source': str(JOINT_H5.relative_to(PIPELINE_ROOT)),
        'nuisances': {
            'A0': round(nu['A0'], 6),
            't_peak': round(nu['t_peak'], 6),
            'A1': round(nu['A1'], 6),
            'phi0': round(nu['phi0'], 6),
            'alpha': round(nu['alpha'], 6),
            'log10_Mdot0': round(float(np.log10(nu['Mdot0_Msun_yr'])), 6),
            'Mdot0_Msun_yr': float(nu['Mdot0_Msun_yr']),
        },
        'best_fit_magnetar': {
            'B': round(nu['Bfield'], 6),
            'P_spin': round(nu['Pspin'], 6),
        },
        'grid': {
            'B_range': [round(grid['B'][0], 6), round(grid['B'][1], 6)],
            'P_spin_range': [round(grid['P_spin'][0], 6),
                             round(grid['P_spin'][1], 6)],
            'B_unit': '1e14 G',
            'P_spin_unit': 'ms',
            'n_B': int(n_B),
            'n_P': int(n_P),
            'spacing': grid['spacing'],
            'source': grid['source'],
        },
        'precision': {
            'time_days': N_PREC_T,
            'residual_mag': N_PREC_MAG,
            'B': N_PREC_B,
            'P_spin': N_PREC_P,
            'chi2': N_PREC_CHI2,
        },
        'time': round_list(t_plot, N_PREC_T),
        'observed': {
            'time': round_list(t_obs, N_PREC_T),
            'residual': round_list(obs, N_PREC_MAG),
            'residual_err': round_list(err, N_PREC_MAG),
        },
        'nodes': nodes,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(artifact, separators=(',', ':'))
    out_path.write_text(text)
    size = out_path.stat().st_size
    n_full = 50 * 50
    n_now = n_B * n_P
    # Scale only the per-node payload; header is shared.
    header_keys = {k: artifact[k] for k in artifact if k != 'nodes'}
    header_size = len(json.dumps(header_keys, separators=(',', ':')))
    node_size = (size - header_size) / max(n_now, 1)
    extra_50 = header_size + node_size * n_full

    print('\n=== artifact ===')
    print(f'  wrote {out_path}  {size:,} bytes')
    print(f'  schema keys: {list(artifact.keys())}')
    print(f'  per-node keys: {list(nodes[0].keys())}')
    print(f'  one node (index 0):')
    sample = dict(nodes[0])
    sample['model'] = sample['model'][:8] + ['...'] + sample['model'][-2:]
    print(f'    {json.dumps(sample, indent=2)}')
    if walls:
        print(f'\n=== timing / size extrapolation to 50x50 ===')
        print(f'  per-node wall-time: median {np.median(walls)*1e3:.1f} ms  '
              f'mean {np.mean(walls)*1e3:.1f} ms  '
              f'max {np.max(walls)*1e3:.1f} ms')
        print(f'  {n_B}x{n_P} wall {grid_wall:.2f}s')
        print(f'  50x50 extrapolated wall  '
              f'{np.median(walls) * n_full:.1f}s  '
              f'(~{np.median(walls) * n_full / 60:.1f} min)  '
              f'using median per-node time')
        print(f'  50x50 extrapolated JSON  {extra_50/1e6:.2f} MB  '
              f'(~{node_size:.0f} bytes/node + {header_size:,} header)')
        print(f'  proposed precision: mag {N_PREC_MAG} decimals '
              f'(0.1 mmag; photometric errors ~0.05 mag), '
              f'time {N_PREC_T} decimals, B/P {N_PREC_B}/{N_PREC_P}, '
              f'chi2 {N_PREC_CHI2}')
        # JSON vs binary: report both.
        binary_50 = header_size + n_full * (8 + N_PLOT * 4)  # 2 floats + float32 curve
        print(f'  50x50 float32 binary curves + JSON header ~ '
              f'{binary_50/1e6:.2f} MB  (JSON is fine at this size)')
    return artifact, walls, size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--n-B', type=int, default=3)
    ap.add_argument('--n-P', type=int, default=3)
    ap.add_argument('--out', type=Path,
                    default=Path(__file__).with_name('chirp_grid_pilot.json'))
    args = ap.parse_args()
    build_artifact(args.n_B, args.n_P, args.out)


if __name__ == '__main__':
    main()
