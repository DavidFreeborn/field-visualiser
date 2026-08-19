export type Quantum2DDisplayQuantity =
  | 'probability-density'
  | 'magnitude'
  | 'real-part'
  | 'imaginary-part'
  | 'phase-magnitude';

export interface Quantum2DDisplaySnapshot {
  readonly kind: 'quantum-2d-display';
  readonly sourceKind: 'quantum-2d-periodic' | 'quantum-2d-fixed';
  readonly time: number;
  readonly systemLabel: '2D torus' | '2D square';
  readonly boundaryCondition: 'periodic' | 'dirichlet';
  readonly modeLabel: 'square-root lattice quantum model';
  readonly quantity: Quantum2DDisplayQuantity;
  readonly width: number;
  readonly height: number;
  readonly domainLength: number;
  readonly spacing: number;
  readonly geometry: 'torus-periodic' | 'square-fixed';
  /** For 'phase-magnitude' this holds the phase (radians); otherwise the quantity itself. */
  readonly displayValues: Float32Array;
  /** Magnitude channel, present only for the 'phase-magnitude' quantity. */
  readonly displayValuesAux?: Float32Array;
  readonly totalNorm: number;
}
