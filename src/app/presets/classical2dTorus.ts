import type { Classical2DConfig } from '../../physics/classical/classical2d';

export const defaultClassical2DTorusConfig: Classical2DConfig = {
  geometry: 'torus-periodic',
  size: 48,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.9,
  gaussianWidth: 0.08,
  initialPreset: 'wraparound-pulse',
};
