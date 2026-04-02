# Field Visualiser

Field Visualiser is a TypeScript web application for scientifically rigorous
visualisation of discrete classical fields and free-field one-particle lattice
models.

## Status

The repository is being built in phases. The current implementation includes:

- 1D periodic and fixed-end classical lattice systems
- 1D periodic and fixed-end free-field one-particle systems
- 2D square and torus classical lattice systems
- 2D square and torus free-field one-particle systems
- Pixi-based 1D and 2D rendering with diagnostics and regression coverage

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
```

## Scientific scope

Version 1 targets:

- classical lattice fields
- oscillator-lattice pedagogical views
- free-field one-particle probability-density visualisations

Version 1 does not attempt interacting quantum field theory.

Quantum mode is a pedagogical one-particle lattice visualisation. The default
red heatmap shows probability density, not a literal classical particle blob.

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
- `src/app` and `src/components`: React shell, controls, presets, diagnostics, and explanatory UI

## Shareable scene state

The app serializes reproducible scene state into a versioned `scene` query
parameter. At a high level the payload includes:

- schema version
- active mode and geometry
- active system config for the selected branch
- displayed quantity
- play/pause state
- speed
- relevant display toggles such as lattice and spring visibility

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
