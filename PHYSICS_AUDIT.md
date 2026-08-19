# Physics audit

## Audit metadata

- **Audit date:** 2026-08-19
- **Base examined:** branch `master`, commit `fb83c6d` ("Overhaul performance,
  scheduling, and legibility"), plus the uncommitted corrections in the
  working tree described in this document. Nothing has been committed or
  pushed as part of this audit.
- **Environment:** Windows 11 Pro (10.0.26200), Node v24.12.0,
  Intel Core i9-13900H (20 threads), 68 GB RAM, Vitest 3.2.4,
  TypeScript 5.9, Playwright 1.54 with local Chromium.
- **Browser testing scope:** the three automated Playwright Chromium e2e
  tests ran locally and passed. Full manual inspection of every scenario in
  the remediation checklist (long-running smoothness, visual judgement of
  packet splitting) has not been performed by a human in this session and is
  listed as follow-up.

An earlier version of this document described corrections performed in a
separate container environment whose code changes never reached this
repository. That document has been replaced: every claim below was produced
by commands run in this working tree on this machine.

## Verdict

- **Classical engines.** The periodic and Dirichlet 1D/2D engines are correct
  implementations of the nearest-neighbour semi-discrete wave equation with
  unit mass density. Every operator eigenvalue, the local-energy allocation,
  the CFL bounds, and the velocity-Verlet update were verified against
  independent analytic expectations (Section "Verification evidence").
- **Convergence to the continuum.** They are not exact continuum solvers.
  Spatial finite differences are second order for smooth resolved fields
  (measured dispersion-error ratios 3.994 and 3.999 under grid doubling);
  velocity Verlet is second order in time (measured error ratio 3.910 when
  halving dt) and symplectic, with bounded oscillatory energy error
  (max relative drift 1.18e-3 over 20,000 recommended steps) rather than
  exact continuum energy conservation.
- **Quantum engines.** They implement exact unitary evolution for the finite
  lattice Hamiltonian `i dpsi/dt = H_h psi`, `H_h = c sqrt(-Delta_h)`,
  `hbar = 1`, with the lattice dispersion (not the continuum `c|k|`). Norm
  and the spectral energy expectation are conserved to machine precision
  through absolute time t = 10,000.
- **Interpretation.** This is a square-root lattice wavefunction model. It is
  not a complete quantized scalar field, an interacting QFT, a
  particle-creation model, or a covariant theory of relativistic
  localization. Product decision (2026-08-19): the field-type selector offers
  the plain names **"Classical field"** and **"Quantum field"**, while the
  explanatory note above the controls carries the precise phrase
  **"Square-root lattice quantum model"**; the serialized scene identifier
  `quantum-one-particle` is kept so old shared URLs continue to load.
- **Release blockers.** None found after the corrections below. The
  suite (245 unit/integration tests), lint, typecheck, production build, and
  the three Chromium e2e tests all pass on this machine. A 34-check scripted
  Chromium walkthrough (`scripts/releaseGate.mjs`) additionally verified ring
  circularity, packet dynamics, reset immediacy, clutter removal, and 60 fps
  playback of the largest 2D quantum cases in a visible browser window.

## Exact models implemented

### Classical lattice field

Periodic 1D sites are x_j = j h with h = L/N and periodic indexing; the fixed
interval includes both endpoints with h = L/(N-1), u_0 = u_{N-1} = 0 and
v_0 = v_{N-1} = 0. The equation of motion is

    d^2 u_j / dt^2 = (c^2/h^2) (u_{j-1} - 2 u_j + u_{j+1}),

with the centred stencil applied only to interior sites in the Dirichlet
case. In 2D the five-point Laplacian is used, with h = L/N on the periodic
torus (both indices wrapped) and h = L/(N-1) on the fixed square (all four
edges pinned to zero).

The discrete Hamiltonian in dimension d is

    E_h = (h^d/2) sum_j v_j^2
        + (c^2 h^d/2) sum_{j,alpha} ((u_{j+e_alpha} - u_j)/h)^2,

with the bond sum following the topology (each physical bond counted exactly
once). For display, half of each bond energy is assigned to each endpoint;
consequently h * sum_j rho_j = E_h in 1D and h^2 * sum_j rho_j = E_h in 2D
(verified to machine precision, see below).

Velocity Verlet applies

    v^{n+1/2} = v^n + (dt/2) a(u^n)
    u^{n+1}   = u^n + dt v^{n+1/2}
    v^{n+1}   = v^{n+1/2} + (dt/2) a(u^{n+1}).

The highest-mode stability limits are dt <= h/c in 1D and
dt <= h/(sqrt(2) c) in 2D. Requested steps beyond 95% of the limit are
subdivided; non-finite dt is rejected; a request needing more than 100,000
substeps is rejected so a huge finite dt cannot hang the process.

### Quantum square-root lattice wavefunction

Periodic 1D frequencies (NOT the continuum 2 pi c |k| / L):

    omega_k = (2c/h) |sin(pi k / N)|,  k = 0..N-1.

Fixed 1D with M = N-2 interior sites, orthonormal DST-I basis
phi_m(j) = sqrt(2/(M+1)) sin(pi m (j+1)/(M+1)):

    omega_m = (2c/h) sin(pi m / (2(M+1))),  m = 1..M.

2D periodic and fixed frequencies are the Euclidean combinations of the
corresponding 1D factors. Initial modal coefficients are immutable and
evolution is absolute-time modal rotation:

    psi_hat_k(t) = e^{-i omega_k t} psi_hat_k(0).

`setTime(t)` performs exactly one modal phase update and one inverse
transform regardless of the size of t (instrumented and asserted in tests).
The transforms are unitary, so sum_j |psi_j|^2 = 1 is conserved, as is the
spectral expectation <H_h> = sum_k omega_k |psi_hat_k|^2. Non-finite times
are rejected, as are times whose maximum modal phase |omega_max t| exceeds
1e12, where double-precision trigonometric argument reduction would stop
being meaningful.

|psi_j|^2 is a lattice **site probability**. A density per unit length or
area would be |psi_j|^2 / h^d under continuum grid refinement. Because
sqrt(-Delta_h) is nonlocal, a decomposition such as Re[psi_j^* (H_h psi)_j]
sums to the global expectation but is not a unique positive site energy, so
no local quantum energy density is displayed; classical local energy remains
available everywhere.

## The reported anomalies, explained

### Positive Gaussian velocity on a ring

A strictly positive Gaussian velocity has positive spatial mean
v_bar = (1/N) sum_j v_j > 0. The periodic constant mode has zero restoring
frequency, so u_bar(t) = u_bar(0) + v_bar t: the whole ring drifts uniformly,
and the radial embedding shows it as the ring expanding. That is a real
uniform (zero) mode amplified by the visual encoding, not an integrator
error. The user-facing preset is `zero-mean-gaussian-velocity`, which
subtracts the exact discrete mean. The positive-mean preset is retained at
engine level only (it is the cleanest way to test zero-mode physics); it is
no longer offered in the UI, and old shared scenes requesting it are remapped
onto the zero-mean correction.

### Gaussian displacement with zero velocity

A displacement packet with v(x,0) = 0 is the equal sum of left-moving and
right-moving branches; the lattice does the same with additional lattice
dispersion. On a radial ring this can look like a wobble. The preset is
labelled "Gaussian displacement, splits both ways", and the split is verified
(two symmetric half-amplitude branches after t = 0.125 at c = 1).

### One-way motion and fixed endpoints

A globally right-moving state is constructed exactly in the mode basis:
v_hat_k = -i sgn(k) omega_k u_hat_k with the discrete omega_k, and the
self-conjugate Nyquist displacement component removed on even lattices (it
has no distinct direction). A globally one-way solution is incompatible with
stationary Dirichlet endpoints, so the fixed-interval engine rejects the
travelling preset and shared scenes requesting it fall back to a valid
default.

## Defects found in this tree and corrected

| # | Defect | Physical consequence | Correction | Regression test |
|---|--------|----------------------|------------|-----------------|
| 1 | Switching mode/geometry never reset the destination model (`App.tsx`) | Returning to a model resumed its stale time and arrays; stale frames could show | Destination controller is reset synchronously in the switch handlers (two periodic-circle views of the same physics are exempt) | `app-shell.test.tsx` "resets the destination model to time zero..." |
| 2 | 2D quantum worker reset published no local frame | Canvas kept pre-reset physics until a worker round trip | Reset and reconfiguration publish a locally computed time-zero frame immediately; generation IDs still invalidate stale results | `useQuantum2DPrototype.test.tsx` "reset publishes a fresh time-zero frame immediately" |
| 3 | Stale worker `error` responses bypassed the generation check | A superseded error could tear down a healthy worker | Errors are ignored unless their generation is current | `useQuantum2DPrototype.test.tsx` "ignores stale worker error responses" |
| 4 | Periodic 1D single-site mapping used an N-1 denominator | Centres near the seam selected the wrong site | `round(c*N) % N` seam mapping | physicsVetting "periodic localization near center = 0.99" |
| 5 | Periodic 1D quantum localization ignored its configured centre | The preset always appeared at the middle site | Centre applied with periodic seam mapping | physicsVetting "uses its configured centre" |
| 6 | Fixed-interval and fixed-square Gaussians used periodic coordinates/wrapping; periodic 2D Gaussians used N-1 coordinates with clamping | Wrong placement near boundaries and seams; asymmetric evolution of centred bumps | Geometry-specific sampling: periodic j/N + shortest wrapped distance, fixed j/(N-1) + ordinary distance | physicsVetting "periodic Gaussians wrap..."; re-locked baselines in `classical1dFixed.test.ts`, `classical2d.test.ts` |
| 7 | Top fixed-mode superposition clamped both indices to the same mode | Norm fell to 0.5 | Distinct adjacent mode is paired at the top edge | physicsVetting "top fixed-mode superposition ... norm one" |
| 8 | Fixed 2D Gaussian carrier used 2*pi*n*x with interior-grid coordinates | Carrier convention disagreed with the Dirichlet sine basis | Carrier is now e^{i pi (n_x x + n_y y)/L} on the physical grid | physicsVetting "Dirichlet pi convention, not 2 pi" |
| 9 | Fixed 2D split preset silently aliased to a single standing mode | Label and state disagreed | Engine rejects it; scene sanitizer replaces it; the UI never offers it on the square | physicsVetting "rejects topology-incompatible presets"; `sceneState.test.ts` |
| 10 | No exact directional packet existed; no zero-mean velocity preset | The zero-mode drift had no corrected alternative; no exact one-way state | `travelling-gaussian-right` (exact discrete dispersion, Nyquist removed) and `zero-mean-gaussian-velocity` presets added (periodic 1D; zero-mean also on the torus) | physicsVetting "moves right with the opposite branch suppressed", "zero-mean velocity preset" |
| 11 | Non-finite values, fractional/out-of-range modes, and centres outside [0,1] passed validation | NaNs or invalid typed-array indexing could contaminate state | Shared `physics/core/validation.ts` applied in every engine; descriptive errors instead of silent clamps | physicsVetting "fails safely on NaN, infinity, fractional modes..." |
| 12 | Huge finite dt / huge quantum times were accepted | A finite dt could hang; huge times produced meaningless phases | Substep budget (1e5) and modal-phase resolvability bound (1e12) | same test |
| 13 | Zero-state normalization divided by zero in the fixed 1D quantum initializer | A narrow boundary-centred Gaussian created a NaN state | Zero/non-finite norm throws "Cannot normalize the zero state" | same test |
| 14 | Scene mode bounds used fixed maxima (2048/256) regardless of lattice size | Shared URLs could construct invalid modes | Sanitizers derive mode ranges from the sanitized size, preset, and topology; degenerate split/counterpropagating modes are adjusted | `sceneState.test.ts` |
| 15 | Degenerate counterpropagating/split modes (0, Nyquist) silently degenerated | A "counterpropagating" label produced a single standing packet (and 50% norm on the fixed interval) | Engines throw; scene sanitizer and the controls auto-correct mode 0 to 1 on preset change | physicsVetting "rejects degenerate ... modes" |
| 16 | Two dense O(N^3) transforms in 2D initializers | Large resets stalled despite fast playback | Periodic split superposition uses the fast unitary 2D inverse FFT; fixed normal modes are built analytically as sine products in O(N^2) | transform-equivalence tests; engine benchmarks |
| 17 | Zero initial energy produced NaN relative drift | Diagnostics NaN | Drift reports 0 for a zero-energy baseline | physicsVetting "reports zero relative drift (not NaN)" |
| 18 | Torus controller seeded from square defaults; geometry switches carried invalid modes into the square quantum engine | Wrong default preset; potential engine exceptions after validation tightening | Geometry-appropriate defaults; config sanitization on geometry change in the 2D quantum hook | `useQuantum2DPrototype.test.tsx` |
| 19 | Deforming/combined ring views filled the min/max envelope as a closed ring-band polygon | Above the pixel budget (site counts > ~1200 on a 540 px ring) Pixi's polygon triangulation took 0.75-2.0 s per frame - the app appeared frozen (found during the manual release-gate walkthrough; pre-existing at fb83c6d) | Ring envelopes are drawn as two closed stroked min/max outlines (~25 ms/frame at 2048 sites); the plot's simple filled ribbon is unchanged | `rendererGuides.test.ts` "never fills the ring envelope band above the pixel budget" |

UI corrections in the same pass: the visible quantum label is "Square-root
lattice quantum model" (serialized `quantum-one-particle` unchanged for URL
compatibility); the statistics strip, the separate display-settings box, and
the ring-centre diagnostics overlay were removed along with the dead
`StatusStrip`, `DisplayControls`, `DiagnosticsPanel`,
`QuantumDiagnosticsPanel`, `AboutPanel`, `PresetPanel`, and `SharePanel`
components and their CSS; the 1D-representation and value-scale selects moved
into the main control panel so the unwrapped analysis plot remains available;
circular geometries still default to the ring view with a true circular
aspect ratio (radii derive from min(width, height)) and renderer resolution
capped at 2x device-pixel ratio.

## Verification evidence

All commands were run in this working tree on the machine described above.

| Check | Command | Result |
|---|---|---|
| Unit and integration tests | `npx vitest run` | **245 passed, 0 failed** (27 files), including the 31-test `src/testing/unit/physicsVetting.test.ts`, 5 scene-sanitization regressions, and the ring-envelope freeze regression |
| ESLint | `npx eslint .` | Passed, 0 problems |
| TypeScript | `npx tsc -b` | Passed |
| Production build | `npx vite build` | Passed (784 modules) |
| End-to-end (Chromium) | `npx playwright test` | 3 passed |
| Whitespace check | `git diff --check` | Clean |
| Prettier repo-wide check | `npx prettier --check .` | Fails on ~100 files, **pre-existing** at fb83c6d (unrelated files such as tsconfig.json are flagged); all files touched by this remediation were formatted |

Numerical evidence (from `physicsVetting.test.ts` assertions and an
instrumented run of the same code):

| Quantity | Value | Acceptance |
|---|---:|---|
| Operator eigenvalues: every periodic 1D mode (N=16), every Dirichlet 1D mode (N=18), representative 2D product modes | pass at tolerance ~1e-9 (toBeCloseTo, 9 digits) | analytic -(4/h^2) sin^2 forms |
| Temporal convergence (Verlet, dt halved): max errors 4.837e-5 -> 1.237e-5 | ratio **3.910** | 3.8 - 4.2 |
| Spatial convergence (measured modal frequency vs continuum 2*pi, N = 16/32/64): errors 4.030e-2 / 1.009e-2 / 2.523e-3 | ratios **3.994, 3.999** | 3.9 - 4.1 |
| Local energy density integration vs E_h (all four classical topologies) | relative error ~**4.7e-16** | 1e-11 |
| Long-time Verlet energy (20,000 recommended steps, dt = 0.0109375, N = 64 standing mode) | max relative drift **1.180e-3**, oscillatory (second-half max not exceeding first-half max) | < 2e-3, non-secular |
| Quantum norm at t = 10,000 (N = 128 periodic wavepacket) | error **8.88e-16** | < 1e-11 |
| Spectral energy expectation at t = 10,000 (dense DFT written in the test) | relative change **1.32e-15** | < 1e-10 |
| Periodic mean velocity after 500 steps | conserved to 12 digits | exact linear zero-mode drift |
| Deterministic reset | reset arrays exactly equal (`toEqual`) to a fresh engine, twice, in all 7 engine implementations | exact |
| Inverse transforms per time update | exactly 1 in all four quantum engines | == 1 |

Engine benchmarks (`npx vitest bench --run src/testing/bench/engines.bench.ts`,
mean per operation; this machine, Node 24.12, single-threaded; engine compute
plus snapshot/display extraction only - browser compositing, GPU upload,
worker messaging, and frame scheduling are excluded):

| Operation | Mean | p99 |
|---|---:|---:|
| Classical 1D, N=128, step+snapshot | 0.0060 ms | 0.048 ms |
| Classical 1D, N=512, step+snapshot | 0.0206 ms | 0.079 ms |
| Classical 1D, N=2048, step+snapshot | 0.0774 ms | 0.164 ms |
| Quantum periodic 1D, N=128, setTime+snapshot | 0.0086 ms | 0.019 ms |
| Quantum periodic 1D, N=512, setTime+snapshot | 0.0552 ms | 0.131 ms |
| Quantum periodic 1D, N=2048, setTime+snapshot | 0.2213 ms | 0.517 ms |
| Quantum fixed 1D, N=129, setTime+snapshot | 0.0197 ms | 0.040 ms |
| Quantum fixed 1D, N=513, setTime+snapshot | 0.0780 ms | 0.170 ms |
| Quantum fixed 1D, N=2049, setTime+snapshot | 0.3350 ms | 0.698 ms |
| Classical 2D, 48x48, step | 0.196 ms | 0.434 ms |
| Classical 2D, 128x128, step | 1.299 ms | 2.010 ms |
| Classical 2D, 256x256, step | 5.571 ms | 8.862 ms |
| Quantum periodic 2D, 24x24, setTime+display | 0.160 ms | 0.332 ms |
| Quantum periodic 2D, 48x48, setTime+display | 0.853 ms | 1.770 ms |
| Quantum periodic 2D, 96x96, setTime+display | 4.129 ms | 6.979 ms |
| Quantum fixed 2D, 25x25, setTime+display | 0.135 ms | 0.279 ms |
| Quantum fixed 2D, 49x49, setTime+display | 0.771 ms | 1.482 ms |
| Quantum fixed 2D, 81x81, setTime+display | 3.298 ms | 4.734 ms |

Scaling is consistent with O(N log N) per displayed time in 1D and
O(N^2 log N) in 2D; every 2D quantum size stays far below a 60 Hz frame
budget, and the 2D quantum work additionally runs off the main thread in a
worker with a latest-target, one-in-flight protocol.

## Subsequent product changes (2026-08-19, same day, post-audit)

At the user's direction, a house-cleaning pass was applied on top of the
corrections above. None of it changes the physics of the engines; every
change resets the simulation to a fresh time-zero state when a relevant
setting changes, and all invariants above were re-verified afterwards.

- The mode selector is labelled **"Field type"** with options "Classical
  field" and "Quantum field" (precise model terminology stays in the panel
  note and this document; serialized identifiers unchanged).
- The legacy positive-mean Gaussian-velocity presets (1D ring and 2D torus)
  were removed from the UI and from shared-scene acceptance; old URLs remap
  to the zero-mean corrections. The engines keep them for zero-mode tests.
- The numbered standing-mode presets became a single **standing-mode
  superposition** preset with a checkbox picker (n = 1..8): the classical
  state is u_j = A sum_n cos/sin modes; old `standing-mode-1/2` scenes remap
  to `standing-modes` with modeNumbers [1]/[2].
- The quantum **normal-mode superposition** preset likewise takes a set of
  modes and builds the equal-weight state (1/sqrt(k)) sum_n phi_n, which has
  exact unit norm because the mode bases are orthonormal (verified to 12
  digits, including the periodic zero mode). Old scenes seed the set from the
  legacy scalar mode number.
- The **Value scale** control was removed; the automatic policy (fixed scale
  for signed quantities, per-frame normalization for non-negative densities)
  is always used and remains stated in the legend.
- Reset-on-change is regression-tested end to end: field type, geometry,
  initial state, standing/normal-mode ticks, and lattice density all return
  the destination model to exactly t = 0 (`app-shell.test.tsx`).

## Interpretation limitations

1. **Lattice model, not continuum identity.** High-wavenumber modes have
   lattice dispersion; smooth resolved solutions converge at second order.
2. **A single-site state is a lattice basis state**, not a grid-independent
   smooth continuum delta approximation.
3. **The quantum Hamiltonian is massless and free.** There is no mass term,
   potential, interaction, particle creation, antiparticle sector, or field
   operators.
4. **The constant periodic quantum state is a valid zero-energy eigenvector**
   of the finite lattice Hamiltonian. In full massless scalar QFT on a
   compact space, the Laplacian zero mode is not an ordinary
   harmonic-oscillator Fock mode and the naive Gaussian vacuum is
   non-normalizable - one reason the model is not labelled as QFT.
5. **Site localization is not claimed as a covariant relativistic position
   observable.** Relativistic localization requires additional assumptions
   and is known to be subtle (Newton-Wigner).
6. **The circular display is an embedding** of a one-dimensional periodic
   field, not literal dynamics of a material ring in 2D space.
7. **Conservation and determinism are verified in IEEE-754 double
   precision** on this machine; this is numerical evidence, not a formal
   proof across all hardware.

## References

- T. D. Newton and E. P. Wigner, "Localized States for Elementary Systems,"
  *Reviews of Modern Physics* 21, 400 (1949).
  https://journals.aps.org/rmp/abstract/10.1103/RevModPhys.21.400
  Used only to establish that relativistic localization requires care and
  extra assumptions; the massless lattice site basis here is not itself a
  Newton-Wigner construction.
- F. Izsak and B. J. Szekeres, "Fractional operators in relativistic quantum
  mechanics: the square-root Klein-Gordon equation," *Annales Universitatis
  Scientiarum Budapestinensis, Sectio Mathematica* 64, 93-108 (2021).
  https://www.researchgate.net/publication/385383747_Fractional_operators_in_relativistic_quantum_mechanics_the_square-root_Klein-Gordon_equation
- H. Huffel and G. Kelnhofer, "Field Space Entanglement Entropy, Zero Modes
  and Lifshitz Models," arXiv:1707.00888. https://arxiv.org/abs/1707.00888
  Relates non-normalizable massless scalar ground states on compact spaces to
  Laplacian zero modes.

## Release recommendation

Suitable for release as a scientific visualiser of the explicitly documented
lattice models. Before tagging a release: commit the working tree, run the
verification commands once more on the release commit, and perform the manual
browser walkthrough (packet splitting, zero-mean vs legacy velocity, ring
circularity at several viewport sizes, largest-resolution 2D playback
smoothness) as a human check on the visual claims. It should not be
advertised as a simulation of full quantum field theory or as an exact
continuum solver.
