import type { Quantum1DPeriodicConfig } from '../../physics/quantum/quantum1dPeriodic';

export const defaultQuantum1DPeriodicConfig: Quantum1DPeriodicConfig = {
  siteCount: 128,
  waveSpeed: 1,
  domainLength: 1,
  initialCenter: 0.5,
  gaussianWidth: 0.08,
  momentumWidth: 2,
  modeNumber: 6,
  initialPreset: 'site-localized',
};
