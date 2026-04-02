import type { Quantum2DPeriodicConfig } from '../../physics/quantum/quantum2dPeriodic';

export const defaultQuantum2DTorusConfig: Quantum2DPeriodicConfig = {
  size: 24,
  waveSpeed: 1,
  domainLength: 1,
  initialCenterX: 0.5,
  initialCenterY: 0.5,
  gaussianWidth: 0.12,
  momentumWidth: 1.2,
  modeNumberX: 3,
  modeNumberY: 0,
  initialPreset: 'site-localized',
};
