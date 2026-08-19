import type { Classical1DFixedConfig } from '../../physics/classical/classical1dFixed';

export const defaultClassical1DFixedConfig: Classical1DFixedConfig = {
  siteCount: 129,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.9,
  initialCenter: 0.5,
  gaussianWidth: 0.06,
  modeNumbers: [1],
  initialPreset: 'gaussian-displacement',
};
