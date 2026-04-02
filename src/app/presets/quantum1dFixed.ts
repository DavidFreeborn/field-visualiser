import type { Quantum1DFixedConfig } from '../../physics/quantum/quantum1dFixed';

export const defaultQuantum1DFixedConfig: Quantum1DFixedConfig = {
  siteCount: 129,
  waveSpeed: 1,
  domainLength: 1,
  initialCenter: 0.5,
  gaussianWidth: 0.08,
  momentumWidth: 2,
  modeNumber: 6,
  initialPreset: 'site-localized',
};
