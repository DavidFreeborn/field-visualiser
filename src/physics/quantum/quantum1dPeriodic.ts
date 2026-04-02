import type { SimulationDiagnostics, SimulationEngine } from '../core/simulation';
import {
  computeDiscreteNorm,
  createQuantumInitialState,
  discreteFourierTransform,
  inverseDiscreteFourierTransform,
  type PeriodicQuantumInitialPreset,
} from './initialStates';

export interface Quantum1DPeriodicConfig {
  readonly siteCount: number;
  readonly waveSpeed: number;
  readonly domainLength: number;
  readonly gaussianWidth: number;
  readonly momentumWidth: number;
  readonly modeNumber: number;
  readonly initialPreset: PeriodicQuantumInitialPreset;
}

export type Quantum1DPeriodicQuantity =
  | 'probability-density'
  | 'magnitude'
  | 'real-part'
  | 'imaginary-part';

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

  private modeFrequencies = new Float64Array(0);

  private modeReal = new Float64Array(0);

  private modeImaginary = new Float64Array(0);

  private siteReal = new Float64Array(0);

  private siteImaginary = new Float64Array(0);

  public constructor(config: Quantum1DPeriodicConfig) {
    this.reset(config);
  }

  public reset(config: Quantum1DPeriodicConfig): void {
    assertValidConfig(config);

    this.config = config;
    this.time = 0;
    this.spacing = config.domainLength / config.siteCount;
    this.modeFrequencies = new Float64Array(
      buildModeFrequencies(config.siteCount, this.spacing, config.waveSpeed),
    );

    const initialSiteState = createQuantumInitialState(config.initialPreset, {
      siteCount: config.siteCount,
      amplitudeCenter: 0.5,
      gaussianWidth: config.gaussianWidth,
      modeNumber: config.modeNumber,
      momentumWidth: config.momentumWidth,
    });

    this.siteReal = new Float64Array(initialSiteState.real);
    this.siteImaginary = new Float64Array(initialSiteState.imaginary);

    const modeState = discreteFourierTransform(this.siteReal, this.siteImaginary);
    this.modeReal = new Float64Array(modeState.real);
    this.modeImaginary = new Float64Array(modeState.imaginary);
  }

  public step(dt: number): void {
    if (dt <= 0) {
      return;
    }

    for (let modeIndex = 0; modeIndex < this.modeReal.length; modeIndex += 1) {
      const phase = -this.modeFrequencies[modeIndex] * dt;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      const real = this.modeReal[modeIndex];
      const imaginary = this.modeImaginary[modeIndex];

      this.modeReal[modeIndex] = real * cosPhase - imaginary * sinPhase;
      this.modeImaginary[modeIndex] = real * sinPhase + imaginary * cosPhase;
    }

    const siteState = inverseDiscreteFourierTransform(this.modeReal, this.modeImaginary);
    this.siteReal = new Float64Array(siteState.real);
    this.siteImaginary = new Float64Array(siteState.imaginary);
    this.time += dt;
  }

  public getSnapshot(
    quantity: Quantum1DPeriodicQuantity = 'probability-density',
  ): Quantum1DPeriodicSnapshot {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    const magnitude = new Float64Array(this.siteReal.length);
    const probabilityDensity = new Float64Array(this.siteReal.length);

    for (let index = 0; index < this.siteReal.length; index += 1) {
      const amplitudeSquared =
        this.siteReal[index] * this.siteReal[index] +
        this.siteImaginary[index] * this.siteImaginary[index];

      magnitude[index] = Math.sqrt(amplitudeSquared);
      probabilityDensity[index] = amplitudeSquared;
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
      amplitudeReal: this.siteReal.slice(),
      amplitudeImaginary: this.siteImaginary.slice(),
      magnitude,
      probabilityDensity,
      modeWeights: computeModeWeights(this.modeReal, this.modeImaginary),
      totalNorm: computeDiscreteNorm(this.siteReal, this.siteImaginary),
    };
  }

  public getDiagnostics(): Quantum1DPeriodicDiagnostics {
    const totalNorm = computeDiscreteNorm(this.modeReal, this.modeImaginary);
    const maximumFrequency = this.modeFrequencies.reduce(
      (currentMax, frequency) => Math.max(currentMax, frequency),
      0,
    );
    const recommendedDt =
      maximumFrequency > 0
        ? (2 * Math.PI) / (maximumFrequency * PHASE_SAMPLES_PER_FASTEST_PERIOD)
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

function computeModeWeights(real: Float64Array, imaginary: Float64Array): Float64Array {
  const weights = new Float64Array(real.length);

  for (let index = 0; index < real.length; index += 1) {
    weights[index] = real[index] * real[index] + imaginary[index] * imaginary[index];
  }

  return weights;
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
