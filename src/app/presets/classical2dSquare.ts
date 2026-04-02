import type { Classical2DConfig } from '../../physics/classical/classical2d';

export const defaultClassical2DSquareConfig: Classical2DConfig = {
  geometry: 'square-fixed',
  size: 48,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.9,
  gaussianWidth: 0.08,
  initialPreset: 'central-gaussian-displacement',
};
