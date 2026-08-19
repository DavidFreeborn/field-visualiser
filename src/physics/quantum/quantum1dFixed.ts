import { fastDst1Unitary } from '../core/fft';
import type { SimulationDiagnostics, SimulationEngine } from '../core/simulation';
import {
  computeDiscreteNorm,
  type Quantum1DInitialPreset,
} from './initialStates';

export interface Quantum1DFixedConfig {
  readonly siteCount: number;
  readonly waveSpeed: number;
  readonly domainLength: number;
  readonly initialCenter: number;
  readonly gaussianWidth: number;
  readonly momentumWidth: number;
  readonly modeNumber: number;
  readonly initialPreset: Quantum1DInitialPreset;
}

export type Quantum1DFixedQuantity =
  | 'probability-density'
  | 'magnitude'
  | 'real-part'
  | 'imaginary-part'
  | 'phase-magnitude'
  | 'real-imaginary-parts';

export interface Quantum1DFixedSnapshot {
  readonly kind: 'quantum-1d-fixed';
  readonly time: number;
  readonly systemLabel: '1D interval';
  readonly boundaryCondition: 'dirichlet';
  readonly modeLabel: 'free-field one-particle';
  readonly quantity: Quantum1DFixedQuantity;
  readonly siteCount: number;
  readonly domainLength: number;
  readonly spacing: number;
  readonly amplitudeReal: Float64Array;
  readonly amplitudeImaginary: Float64Array;
  readonly magnitude: Float64Array;
  readonly probabilityDensity: Float64Array;
  readonly modeWeights: Float64Array;
  readonly totalNorm: number;
}

export interface Quantum1DFixedDiagnostics extends SimulationDiagnostics {
  readonly totalNorm: number;
  readonly normError: number;
}

const PHASE_SAMPLES_PER_FASTEST_PERIOD = 24;

interface SnapshotBuffers {
  amplitudeReal: Float64Array;
  amplitudeImaginary: Float64Array;
  magnitude: Float64Array;
  probabilityDensity: Float64Array;
}

/**
 * Exact modal evolution of the fixed-end (Dirichlet) free-field one-particle
 * state. The Dirichlet normal modes are the orthonormal DST-I basis
 * sqrt(2/(N+1)) sin(pi m (j+1) / (N+1)) over the N interior sites; the two
 * boundary sites are pinned to zero. As with the periodic engine, the initial
 * modal coefficients are immutable and `setTime(t)` performs one phase
 * rotation and one inverse transform (fast DST-I) regardless of target time.
 */
export class Quantum1DFixedEngine
  implements
    SimulationEngine<Quantum1DFixedConfig, Quantum1DFixedSnapshot, Quantum1DFixedDiagnostics>
{
  private config: Quantum1DFixedConfig | null = null;
  private time = 0;
  private spacing = 1;
  private interiorCount = 0;
  private maximumFrequency = 0;
  private modeFrequencies: Float64Array = new Float64Array(0);
  private initialModeReal: Float64Array = new Float64Array(0);
  private initialModeImaginary: Float64Array = new Float64Array(0);
  private modeReal = new Float64Array(0);
  private modeImaginary = new Float64Array(0);
  private interiorReal = new Float64Array(0);
  private interiorImaginary = new Float64Array(0);
  private siteReal = new Float64Array(0);
  private siteImaginary = new Float64Array(0);
  private modeWeights = new Float64Array(0);
  private snapshotBuffers: [SnapshotBuffers, SnapshotBuffers] | null = null;
  private snapshotParity = 0;

  /** Number of inverse transforms performed since construction (test instrumentation). */
  public inverseTransformCount = 0;

  public constructor(config: Quantum1DFixedConfig) {
    this.reset(config);
  }

  public reset(config: Quantum1DFixedConfig): void {
    assertValidConfig(config);

    this.config = config;
    this.time = 0;
    this.spacing = config.domainLength / (config.siteCount - 1);
    this.interiorCount = config.siteCount - 2;
    this.modeFrequencies = buildDirichletModeFrequencies(
      this.interiorCount,
      this.spacing,
      config.waveSpeed,
    );
    this.maximumFrequency = this.modeFrequencies.reduce(
      (currentMax, frequency) => Math.max(currentMax, frequency),
      0,
    );

    const initialState = createDirichletInitialState(config, this.interiorCount);
    this.initialModeReal = initialState.modeReal;
    this.initialModeImaginary = initialState.modeImaginary;
    this.modeReal = new Float64Array(this.initialModeReal);
    this.modeImaginary = new Float64Array(this.initialModeImaginary);

    this.interiorReal = new Float64Array(this.interiorCount);
    this.interiorImaginary = new Float64Array(this.interiorCount);
    this.siteReal = new Float64Array(config.siteCount);
    this.siteImaginary = new Float64Array(config.siteCount);
    this.modeWeights = new Float64Array(this.interiorCount);
    for (let index = 0; index < this.interiorCount; index += 1) {
      this.modeWeights[index] =
        this.initialModeReal[index] * this.initialModeReal[index] +
        this.initialModeImaginary[index] * this.initialModeImaginary[index];
    }

    this.snapshotBuffers = [
      createSnapshotBuffers(config.siteCount),
      createSnapshotBuffers(config.siteCount),
    ];
    this.snapshotParity = 0;

    this.applyModesToSites();
  }

  /** Advances relative to the current time. Equivalent to setTime(time + dt). */
  public step(dt: number): void {
    if (dt <= 0) {
      return;
    }

    this.setTime(this.time + dt);
  }

  /**
   * Jumps the state to the given absolute simulation time in one modal phase
   * update and one inverse transform.
   */
  public setTime(time: number): void {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    this.time = Math.max(0, time);

    for (let modeIndex = 0; modeIndex < this.modeReal.length; modeIndex += 1) {
      const phase = -this.modeFrequencies[modeIndex] * this.time;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      const real = this.initialModeReal[modeIndex];
      const imaginary = this.initialModeImaginary[modeIndex];
      this.modeReal[modeIndex] = real * cosPhase - imaginary * sinPhase;
      this.modeImaginary[modeIndex] = real * sinPhase + imaginary * cosPhase;
    }

    this.applyModesToSites();
  }

  private applyModesToSites(): void {
    fastDst1Unitary(this.modeReal, this.modeImaginary, this.interiorReal, this.interiorImaginary);
    this.inverseTransformCount += 1;

    // Embed the interior into the full lattice with pinned zero endpoints.
    this.siteReal[0] = 0;
    this.siteImaginary[0] = 0;
    this.siteReal[this.siteReal.length - 1] = 0;
    this.siteImaginary[this.siteImaginary.length - 1] = 0;
    this.siteReal.set(this.interiorReal, 1);
    this.siteImaginary.set(this.interiorImaginary, 1);
  }

  public getSnapshot(
    quantity: Quantum1DFixedQuantity = 'probability-density',
  ): Quantum1DFixedSnapshot {
    if (this.config === null || this.snapshotBuffers === null) {
      throw new Error('Engine has not been initialised.');
    }

    // Double-buffered, allocation-free steady-state snapshots (see the
    // periodic engine for rationale).
    this.snapshotParity = 1 - this.snapshotParity;
    const buffers = this.snapshotBuffers[this.snapshotParity];

    buffers.amplitudeReal.set(this.siteReal);
    buffers.amplitudeImaginary.set(this.siteImaginary);
    for (let index = 0; index < this.siteReal.length; index += 1) {
      const amplitudeSquared =
        this.siteReal[index] * this.siteReal[index] +
        this.siteImaginary[index] * this.siteImaginary[index];
      buffers.magnitude[index] = Math.sqrt(amplitudeSquared);
      buffers.probabilityDensity[index] = amplitudeSquared;
    }

    return {
      kind: 'quantum-1d-fixed',
      time: this.time,
      systemLabel: '1D interval',
      boundaryCondition: 'dirichlet',
      modeLabel: 'free-field one-particle',
      quantity,
      siteCount: this.config.siteCount,
      domainLength: this.config.domainLength,
      spacing: this.spacing,
      amplitudeReal: buffers.amplitudeReal,
      amplitudeImaginary: buffers.amplitudeImaginary,
      magnitude: buffers.magnitude,
      probabilityDensity: buffers.probabilityDensity,
      modeWeights: this.modeWeights,
      totalNorm: computeDiscreteNorm(this.modeReal, this.modeImaginary),
    };
  }

  public getDiagnostics(): Quantum1DFixedDiagnostics {
    const totalNorm = computeDiscreteNorm(this.modeReal, this.modeImaginary);
    const recommendedDt =
      this.maximumFrequency > 0
        ? (2 * Math.PI) / (this.maximumFrequency * PHASE_SAMPLES_PER_FASTEST_PERIOD)
        : 0.05;

    return {
      maxStableDt: Number.POSITIVE_INFINITY,
      recommendedDt,
      stabilityRatio: 1,
      totalNorm,
      normError: Math.abs(totalNorm - 1),
    };
  }
}

function createSnapshotBuffers(siteCount: number): SnapshotBuffers {
  return {
    amplitudeReal: new Float64Array(siteCount),
    amplitudeImaginary: new Float64Array(siteCount),
    magnitude: new Float64Array(siteCount),
    probabilityDensity: new Float64Array(siteCount),
  };
}

function createDirichletInitialState(
  config: Quantum1DFixedConfig,
  interiorCount: number,
): {
  modeReal: Float64Array;
  modeImaginary: Float64Array;
} {
  switch (config.initialPreset) {
    case 'site-localized':
      return forwardSineTransform(
        ...createSiteLocalizedInteriorState(interiorCount, config.initialCenter),
      );
    case 'gaussian-wavepacket':
      return forwardSineTransform(
        ...createGaussianInteriorState(
          interiorCount,
          config.initialCenter,
          config.gaussianWidth,
          config.modeNumber,
        ),
      );
    case 'selected-normal-mode':
      return createSelectedDirichletMode(interiorCount, config.modeNumber);
    case 'counterpropagating-superposition':
      return createModeSuperposition(interiorCount, config.modeNumber);
  }
}

function forwardSineTransform(
  real: Float64Array,
  imaginary: Float64Array,
): { modeReal: Float64Array; modeImaginary: Float64Array } {
  const modeReal = new Float64Array(real.length);
  const modeImaginary = new Float64Array(real.length);
  fastDst1Unitary(real, imaginary, modeReal, modeImaginary);
  return { modeReal, modeImaginary };
}

function createSiteLocalizedInteriorState(
  interiorCount: number,
  center: number,
): [Float64Array, Float64Array] {
  const real = new Float64Array(interiorCount);
  const imaginary = new Float64Array(interiorCount);
  const centerIndex = Math.max(0, Math.min(interiorCount - 1, Math.round(center * (interiorCount + 1)) - 1));
  real[centerIndex] = 1;
  return normalizeInteriorState(real, imaginary);
}

function createGaussianInteriorState(
  interiorCount: number,
  center: number,
  width: number,
  modeNumber: number,
): [Float64Array, Float64Array] {
  const real = new Float64Array(interiorCount);
  const imaginary = new Float64Array(interiorCount);

  for (let index = 0; index < interiorCount; index += 1) {
    const normalizedPosition = (index + 1) / (interiorCount + 1);
    const delta = normalizedPosition - center;
    const envelope = Math.exp(-0.5 * (delta / width) * (delta / width));
    const phase = (Math.PI * modeNumber * (index + 1)) / (interiorCount + 1);
    real[index] = envelope * Math.cos(phase);
    imaginary[index] = envelope * Math.sin(phase);
  }

  return normalizeInteriorState(real, imaginary);
}

function normalizeInteriorState(
  real: Float64Array,
  imaginary: Float64Array,
): [Float64Array, Float64Array] {
  const norm = Math.sqrt(computeDiscreteNorm(real, imaginary));

  for (let index = 0; index < real.length; index += 1) {
    real[index] /= norm;
    imaginary[index] /= norm;
  }

  return [real, imaginary];
}

function createSelectedDirichletMode(
  interiorCount: number,
  modeNumber: number,
): { modeReal: Float64Array; modeImaginary: Float64Array } {
  const modeReal = new Float64Array(interiorCount);
  const modeImaginary = new Float64Array(interiorCount);
  const selectedIndex = Math.max(0, Math.min(interiorCount - 1, modeNumber - 1));
  modeReal[selectedIndex] = 1;
  return { modeReal, modeImaginary };
}

function createModeSuperposition(
  interiorCount: number,
  modeNumber: number,
): { modeReal: Float64Array; modeImaginary: Float64Array } {
  const modeReal = new Float64Array(interiorCount);
  const modeImaginary = new Float64Array(interiorCount);
  const firstIndex = Math.max(0, Math.min(interiorCount - 1, modeNumber - 1));
  const secondIndex = Math.max(0, Math.min(interiorCount - 1, modeNumber));
  const scale = 1 / Math.sqrt(2);
  modeReal[firstIndex] = scale;
  modeReal[secondIndex] = scale;
  return { modeReal, modeImaginary };
}

function buildDirichletModeFrequencies(
  interiorCount: number,
  spacing: number,
  waveSpeed: number,
): Float64Array {
  const frequencies = new Float64Array(interiorCount);

  for (let modeIndex = 0; modeIndex < interiorCount; modeIndex += 1) {
    const modeNumber = modeIndex + 1;
    frequencies[modeIndex] =
      (2 * waveSpeed * Math.sin((Math.PI * modeNumber) / (2 * (interiorCount + 1)))) / spacing;
  }

  return frequencies;
}

function assertValidConfig(config: Quantum1DFixedConfig): void {
  if (!Number.isInteger(config.siteCount) || config.siteCount < 4) {
    throw new Error('siteCount must be an integer greater than or equal to 4.');
  }

  if (
    config.domainLength <= 0 ||
    config.waveSpeed <= 0 ||
    config.gaussianWidth <= 0 ||
    config.momentumWidth <= 0
  ) {
    throw new Error('All physical scales must be positive.');
  }
}
