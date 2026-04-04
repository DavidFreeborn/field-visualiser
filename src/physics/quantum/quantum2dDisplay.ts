export type Quantum2DDisplayQuantity =
  | 'probability-density'
  | 'magnitude'
  | 'real-part'
  | 'imaginary-part';

export interface Quantum2DDisplaySnapshot {
  readonly kind: 'quantum-2d-display';
  readonly sourceKind: 'quantum-2d-periodic' | 'quantum-2d-fixed';
  readonly time: number;
  readonly systemLabel: '2D torus' | '2D square';
  readonly boundaryCondition: 'periodic' | 'dirichlet';
  readonly modeLabel: 'free-field one-particle';
  readonly quantity: Quantum2DDisplayQuantity;
  readonly width: number;
  readonly height: number;
  readonly domainLength: number;
  readonly spacing: number;
  readonly geometry: 'torus-periodic' | 'square-fixed';
  readonly displayValues: Float32Array;
  readonly totalNorm: number;
}
