export interface RoadmapEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly status: 'active' | 'planned';
}

export const projectRoadmap: readonly RoadmapEntry[] = [
  {
    id: 'phase-1',
    title: 'Project setup',
    summary:
      'Strict TypeScript, Vite, React, PixiJS, Vitest, Playwright, and clean module boundaries.',
    status: 'active',
  },
  {
    id: 'phase-2',
    title: '1D periodic classical prototype',
    summary:
      'Symplectic lattice evolution, diagnostics, and a production-ready waveform renderer.',
    status: 'planned',
  },
  {
    id: 'phase-3',
    title: 'Generalisation',
    summary:
      'Extend the validated physics core to quantum one-particle and higher-dimensional systems.',
    status: 'planned',
  },
];
