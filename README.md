# Field Visualiser

Field Visualiser is a TypeScript web application for scientifically rigorous
visualisation of two explicitly documented finite lattice models:

- the **classical nearest-neighbour semi-discrete wave equation**
  (velocity-Verlet time integration, periodic or homogeneous Dirichlet
  boundaries), and
- the **square-root lattice quantum model**
  `i dpsi/dt = c sqrt(-Delta_h) psi` (exact unitary modal evolution of a
  lattice wavefunction; hbar = 1).

Neither is an exact continuum solver, and the quantum model is not a full
quantized scalar field theory. The exact equations, invariants, verification
evidence, and interpretation limits are documented in
[`PHYSICS_AUDIT.md`](./PHYSICS_AUDIT.md).

## Status

The repository is being built in phases. The current implementation includes:

- 1D periodic and fixed-end classical lattice systems
- 1D periodic and fixed-end square-root lattice quantum systems
- 2D square and torus classical lattice systems
- 2D square and torus square-root lattice quantum systems
- Pixi-based 1D and 2D rendering with regression coverage

Performance and rendering architecture:

- Quantum evolution is analytic in the mode basis: immutable initial modal
  coefficients plus `setTime(t)`, i.e. one phase rotation and one inverse
  transform per displayed frame, at any target time (no CFL-style substepping)
- Transforms are O(N log N): radix-2 FFT for power-of-two sizes, Bluestein's
  chirp-z for arbitrary sizes, DST-I via odd extension for Dirichlet systems,
  with a cached dense mat-vec below the measured small-size crossover;
  the dense reference transforms are retained for equivalence tests
- The 2D quantum worker uses a latest-target-time protocol: at most one
  calculation in flight, coalesced newest target, generation IDs that
  invalidate stale results on reset/config/quantity changes, and display
  buffers recycled between main thread and worker
- Per-frame numeric data bypasses React state through an imperative frame
  channel; React handles configuration and ~3 Hz diagnostics only
- 1D rendering aggregates to the screen-space pixel budget (min/max envelope
  for signed traces, mean with max outline for densities), the fixed ring is
  a single texture-mapped mesh, and renderer resolution is capped at 2x DPR
- Periodic 1D systems render as true circles by default (the topology is the
  point) with an uncluttered centre; the unwrapped plot remains available as
  an analysis view
- 1D quantum systems offer a combined Re/Im view: two radial displacement
  traces (colorblind-safe blue solid / orange dashed) around the base circle,
  sharing one symmetric scale from max(|Re psi|, |Im psi|)

The codebase already separates:

- `physics-core`: deterministic simulation logic
- `render-core`: display-only drawing adapters
- `ui-app`: React application shell and controls

## Stack

- React 19
- Vite 7
- TypeScript 5 in strict mode
- PixiJS 8 for future high-performance rendering
- Vitest + Testing Library
- Playwright
- ESLint + Prettier

## Commands

```bash
npm install
npm run dev
npm run test
npm run build
npm run test:e2e
npm run bench   # vitest benchmarks: transforms, engines, renderer
```

## Scientific scope

Version 1 targets:

- classical nearest-neighbour lattice fields (semi-discrete wave equation)
- oscillator-lattice pedagogical views
- square-root lattice quantum model site-probability visualisations

Version 1 does not attempt interacting quantum field theory, particle
creation, a mass term, or a covariant theory of relativistic localization.

The quantum mode evolves a lattice wavefunction under `c sqrt(-Delta_h)` with
its lattice dispersion (not the continuum `omega = c|k|`). The displayed
`|psi_i|^2` is a lattice **site probability** (summing to one); a continuum
probability density would require division by `h^d` under grid refinement.
See `PHYSICS_AUDIT.md` for the full derivation, verification evidence, and
interpretation limits.

## Release checklist

Install:

```bash
npm install
```

Verify:

```bash
npm run test
npm run lint
npm run build
npm run test:e2e
```

Preview the production build:

```bash
npm run preview
```

Build for a website subpath:

```bash
VITE_BASE_PATH=/science/field-visualiser/ npm run build
```

The Vite config emits a manifest and rewrites production asset URLs against
`VITE_BASE_PATH`, so bundles can be mounted under a site subsection without
hand-editing asset paths.

Sample production command sequence:

```bash
npm install
npm run test
npm run lint
VITE_BASE_PATH=/science/field-visualiser/ npm run build
npm run preview
```

## Embedding

This app is website-ready as a static bundle. Common options:

- Deploy `dist/` at a subpath and embed it in a host page with an `iframe`
- Serve `dist/` directly as a standalone page linked from a content site
- Mount the app behind a reverse proxy path if the host site already has a web server

Example iframe embed:

```html
<iframe
  src="/science/field-visualiser/?embed=1"
  title="Field Visualiser"
  loading="lazy"
  style="width: 100%; min-height: 780px; border: 0;"
></iframe>
```

Embedded mode:

- enable with `?embed=1`
- trims non-essential outer chrome while keeping controls, canvas, diagnostics, and help cards usable
- intended for iframe embedding on an existing website page
- copied share links intentionally omit `embed=1` so a shared scene opens the full app by default

Recommended embed considerations:

- give the host container enough width for the two-column desktop layout
- allow at least `720px` of height for the control panel, canvas, and diagnostics stack
- use the responsive layout for narrower slots; controls and diagnostics collapse cleanly on mobile-width containers

## Architecture

Current module boundaries:

- `src/physics`: deterministic lattice engines, operators, invariants, and exact modal solvers
- `src/rendering`: Pixi renderer and display-only color/geometry transforms
- `src/app` and `src/components`: React shell, controls, presets, and explanatory UI

## Shareable scene state

The app serializes reproducible scene state into a versioned `scene` query
parameter. At a high level the payload includes:

- schema version
- active mode and geometry
- active system config for the selected branch
- displayed quantity (including the complex phase-magnitude view and the
  combined `real-imaginary-parts` view for 1D quantum systems)
- 1D representation (`view1d`: the circle topology view, the default, or the
  unwrapped analysis plot) and value-scale policy (`scaleMode`: auto, fixed,
  or normalize each frame)
- play/pause state
- speed
- relevant display toggles such as lattice and spring visibility

Scene URLs serialized before `view1d`/`scaleMode` existed continue to load
with an equivalent physical configuration; the new display fields default to
the current defaults (`ring`, `auto`), so circular geometries open as
circles.

Transient diagnostics, render timings, loading state, and runtime errors are
not serialized.

Share links:

- restore the current scene from the URL on load
- update in place with `history.replaceState`, so slider drags do not create a long back-stack
- omit `embed=1` when copied, so links shared from an iframe open the full standalone app unless you deliberately keep the embed flag yourself

## Verification

```bash
npm run test
npm run lint
npm run build
npm run test:e2e
```
