import { fastForwardDftUnitary, fastInverseDftUnitary } from '../core/fft';
import type { SimulationDiagnostics, SimulationEngine } from '../core/simulation';
import {
  computeDiscreteNorm,
  createQuantumInitialState,
  type Quantum1DInitialPreset,
} from './initialStates';

export interface Quantum1DPeriodicConfig {
  readonly siteCount: number;
  readonly waveSpeed: number;
  readonly domainLength: number;
  readonly initialCenter: number;
  readonly gaussianWidth: number;
  readonly momentumWidth: number;
  readonly modeNumber: number;
  readonly initialPreset: Quantum1DInitialPreset;
}

export type Quantum1DPeriodicQuantity =
  | 'probability-density'
  | 'magnitude'
  | 'real-part'
  | 'imaginary-part'
  | 'phase-magnitude'
  | 'real-imaginary-parts';

export interface Quantum1DPeriodicSnapshot {
  readonly kind: 'quantum-1d-periodic';
  readonly time: number;
  readonly systemLabel: '1D circle';
  readonly boundaryCondition: 'periodic';
  readonly modeLabel: 'free-field one-particle';
  readonly quantity: Quantum1DPeriodicQuantity;
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

export interface Quantum1DPeriodicDiagnostics extends SimulationDiagnostics {
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
 * Exact modal evolution of the periodic free-field one-particle state.
 *
 * The initial modal coefficients are kept immutable; `setTime(t)` derives the
 * coefficients at absolute time `t` directly as c_k(t) = c_k(0) e^{-i w_k t},
 * so evolution is a single phase rotation plus one inverse FFT regardless of
 * how far the target time is from the current one. There is no CFL-style
 * substepping: the evolution is analytic and stable for any target time.
 */
export class Quantum1DPeriodicEngine
  implements
    SimulationEngine<
      Quantum1DPeriodicConfig,
      Quantum1DPeriodicSnapshot,
      Quantum1DPeriodicDiagnostics
    >
{
  private config: Quantum1DPeriodicConfig | null = null;

  private time = 0;

  private spacing = 1;

  private maximumFrequency = 0;

  private modeFrequencies: Float64Array = new Float64Array(0);

  private initialModeReal = new Float64Array(0);

  private initialModeImaginary = new Float64Array(0);

  private modeReal = new Float64Array(0);

  private modeImaginary = new Float64Array(0);

  private siteReal = new Float64Array(0);

  private siteImaginary = new Float64Array(0);

  private modeWeights = new Float64Array(0);

  private snapshotBuffers: [SnapshotBuffers, SnapshotBuffers] | null = null;

  private snapshotParity = 0;

  /** Number of inverse transforms performed since construction (test instrumentation). */
  public inverseTransformCount = 0;

  public constructor(config: Quantum1DPeriodicConfig) {
    this.reset(config);
  }

  public reset(config: Quantum1DPeriodicConfig): void {
    assertValidConfig(config);

    this.config = config;
    this.time = 0;
    this.spacing = config.domainLength / config.siteCount;
    this.modeFrequencies = buildModeFrequencies(config.siteCount, this.spacing, config.waveSpeed);
    this.maximumFrequency = this.modeFrequencies.reduce(
      (currentMax, frequency) => Math.max(currentMax, frequency),
      0,
    );

    const initialSiteState = createQuantumInitialState(config.initialPreset, {
      siteCount: config.siteCount,
      amplitudeCenter: config.initialCenter,
      gaussianWidth: config.gaussianWidth,
      modeNumber: config.modeNumber,
      momentumWidth: config.momentumWidth,
    });

    const siteCount = config.siteCount;
    this.siteReal = new Float64Array(initialSiteState.real);
    this.siteImaginary = new Float64Array(initialSiteState.imaginary);
    this.initialModeReal = new Float64Array(siteCount);
    this.initialModeImaginary = new Float64Array(siteCount);
    fastForwardDftUnitary(
      this.siteReal,
      this.siteImaginary,
      this.initialModeReal,
      this.initialModeImaginary,
    );
    this.modeReal = new Float64Array(this.initialModeReal);
    this.modeImaginary = new Float64Array(this.initialModeImaginary);

    this.modeWeights = new Float64Array(siteCount);
    for (let index = 0; index < siteCount; index += 1) {
      this.modeWeights[index] =
        this.initialModeReal[index] * this.initialModeReal[index] +
        this.initialModeImaginary[index] * this.initialModeImaginary[index];
    }

    this.snapshotBuffers = [createSnapshotBuffers(siteCount), createSnapshotBuffers(siteCount)];
    this.snapshotParity = 0;
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

    fastInverseDftUnitary(this.modeReal, this.modeImaginary, this.siteReal, this.siteImaginary);
    this.inverseTransformCount += 1;
  }

  public getSnapshot(
    quantity: Quantum1DPeriodicQuantity = 'probability-density',
  ): Quantum1DPeriodicSnapshot {
    if (this.config === null || this.snapshotBuffers === null) {
      throw new Error('Engine has not been initialised.');
    }

    // Alternate between two persistent buffer sets so a consumer holding the
    // previously returned snapshot never observes it mutating underneath it,
    // while steady-state playback performs no typed-array allocation.
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
      kind: 'quantum-1d-periodic',
      time: this.time,
      systemLabel: '1D circle',
      boundaryCondition: 'periodic',
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
      totalNorm: computeDiscreteNorm(this.siteReal, this.siteImaginary),
    };
  }

  public getDiagnostics(): Quantum1DPeriodicDiagnostics {
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

function buildModeFrequencies(
  siteCount: number,
  spacing: number,
  waveSpeed: number,
): Float64Array {
  const frequencies = new Float64Array(siteCount);

  for (let modeIndex = 0; modeIndex < siteCount; modeIndex += 1) {
    frequencies[modeIndex] =
      (2 * waveSpeed * Math.abs(Math.sin((Math.PI * modeIndex) / siteCount))) / spacing;
  }

  return frequencies;
}

function assertValidConfig(config: Quantum1DPeriodicConfig): void {
  if (!Number.isInteger(config.siteCount) || config.siteCount < 8) {
    throw new Error('siteCount must be an integer greater than or equal to 8.');
  }

  if (config.domainLength <= 0 || config.waveSpeed <= 0) {
    throw new Error('domainLength and waveSpeed must be positive.');
  }

  if (config.gaussianWidth <= 0 || config.momentumWidth <= 0) {
    throw new Error('gaussianWidth and momentumWidth must be positive.');
  }
}
