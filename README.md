# Field Visualiser

Field Visualiser is a TypeScript web application for scientifically rigorous
visualisation of discrete classical fields and free-field one-particle lattice
models.

## Status

The repository is being built in phases. The current implementation includes a
validated first prototype:

- 1D periodic classical lattice dynamics
- symplectic time stepping
- Pixi-based waveform rendering
- energy diagnostics

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

- classical lattice fields,
- oscillator-lattice pedagogical views,
- free-field one-particle probability-density visualisations.

Version 1 does not attempt interacting quantum field theory.

## Phase order

1. Project setup and strict tooling
2. 1D periodic classical prototype
3. 1D periodic free-field one-particle mode
4. Fixed-end 1D systems
5. 2D square and torus systems
