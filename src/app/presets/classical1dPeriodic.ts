import type { Classical1DPeriodicConfig } from '../../physics/classical/classical1dPeriodic';

export const defaultClassical1DPeriodicConfig: Classical1DPeriodicConfig = {
  siteCount: 128,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.9,
  initialCenter: 0.5,
  gaussianWidth: 0.06,
  modeNumbers: [1],
  initialPreset: 'gaussian-displacement',
};
