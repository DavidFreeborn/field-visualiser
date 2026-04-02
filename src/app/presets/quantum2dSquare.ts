import type { Quantum2DFixedConfig } from '../../physics/quantum/quantum2dFixed';

export const defaultQuantum2DSquareConfig: Quantum2DFixedConfig = {
  size: 25,
  waveSpeed: 1,
  domainLength: 1,
  initialCenterX: 0.5,
  initialCenterY: 0.5,
  gaussianWidth: 0.12,
  momentumWidth: 1.2,
  modeNumberX: 1,
  modeNumberY: 1,
  initialPreset: 'site-localized',
};
