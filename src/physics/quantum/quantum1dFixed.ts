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
  | 'imaginary-part';

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

export class Quantum1DFixedEngine
  implements
    SimulationEngine<Quantum1DFixedConfig, Quantum1DFixedSnapshot, Quantum1DFixedDiagnostics>
{
  private config: Quantum1DFixedConfig | null = null;
  private time = 0;
  private spacing = 1;
  private interiorCount = 0;
  private modeFrequencies = new Float64Array(0);
  private modeReal = new Float64Array(0);
  private modeImaginary = new Float64Array(0);
  private siteReal = new Float64Array(0);
  private siteImaginary = new Float64Array(0);

  public constructor(config: Quantum1DFixedConfig) {
    this.reset(config);
  }

  public reset(config: Quantum1DFixedConfig): void {
    assertValidConfig(config);

    this.config = config;
    this.time = 0;
    this.spacing = config.domainLength / (config.siteCount - 1);
    this.interiorCount = config.siteCount - 2;
    this.modeFrequencies = new Float64Array(
      buildDirichletModeFrequencies(this.interiorCount, this.spacing, config.waveSpeed),
    );

    const initialState = createDirichletInitialState(config, this.interiorCount);
    this.modeReal = new Float64Array(initialState.modeReal);
    this.modeImaginary = new Float64Array(initialState.modeImaginary);

    const siteState = inverseSineTransform(this.modeReal, this.modeImaginary);
    this.siteReal = new Float64Array(embedWithFixedEnds(siteState.real));
    this.siteImaginary = new Float64Array(embedWithFixedEnds(siteState.imaginary));
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

    const siteState = inverseSineTransform(this.modeReal, this.modeImaginary);
    this.siteReal = new Float64Array(embedWithFixedEnds(siteState.real));
    this.siteImaginary = new Float64Array(embedWithFixedEnds(siteState.imaginary));
    this.time += dt;
  }

  public getSnapshot(
    quantity: Quantum1DFixedQuantity = 'probability-density',
  ): Quantum1DFixedSnapshot {
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
      kind: 'quantum-1d-fixed',
      time: this.time,
      systemLabel: '1D interval',
      boundaryCondition: 'dirichlet',
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
      totalNorm: computeDiscreteNorm(this.modeReal, this.modeImaginary),
    };
  }

  public getDiagnostics(): Quantum1DFixedDiagnostics {
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

function createDirichletInitialState(
  config: Quantum1DFixedConfig,
  interiorCount: number,
): {
  modeReal: Float64Array;
  modeImaginary: Float64Array;
} {
  switch (config.initialPreset) {
    case 'site-localized':
      return sineTransform(...createSiteLocalizedInteriorState(interiorCount, config.initialCenter));
    case 'gaussian-wavepacket':
      return sineTransform(
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

function sineTransform(
  real: Float64Array,
  imaginary: Float64Array,
): { modeReal: Float64Array; modeImaginary: Float64Array } {
  const interiorCount = real.length;
  const modeReal = new Float64Array(interiorCount);
  const modeImaginary = new Float64Array(interiorCount);
  const normalization = Math.sqrt(2 / (interiorCount + 1));

  for (let modeIndex = 0; modeIndex < interiorCount; modeIndex += 1) {
    const modeNumber = modeIndex + 1;
    let sumReal = 0;
    let sumImaginary = 0;

    for (let siteIndex = 0; siteIndex < interiorCount; siteIndex += 1) {
      const basisValue =
        normalization * Math.sin((Math.PI * modeNumber * (siteIndex + 1)) / (interiorCount + 1));
      sumReal += basisValue * real[siteIndex];
      sumImaginary += basisValue * imaginary[siteIndex];
    }

    modeReal[modeIndex] = sumReal;
    modeImaginary[modeIndex] = sumImaginary;
  }

  return { modeReal, modeImaginary };
}

function inverseSineTransform(
  modeReal: Float64Array,
  modeImaginary: Float64Array,
): { real: Float64Array; imaginary: Float64Array } {
  const interiorCount = modeReal.length;
  const real = new Float64Array(interiorCount);
  const imaginary = new Float64Array(interiorCount);
  const normalization = Math.sqrt(2 / (interiorCount + 1));

  for (let siteIndex = 0; siteIndex < interiorCount; siteIndex += 1) {
    let sumReal = 0;
    let sumImaginary = 0;

    for (let modeIndex = 0; modeIndex < interiorCount; modeIndex += 1) {
      const modeNumber = modeIndex + 1;
      const basisValue =
        normalization * Math.sin((Math.PI * modeNumber * (siteIndex + 1)) / (interiorCount + 1));
      sumReal += basisValue * modeReal[modeIndex];
      sumImaginary += basisValue * modeImaginary[modeIndex];
    }

    real[siteIndex] = sumReal;
    imaginary[siteIndex] = sumImaginary;
  }

  return { real, imaginary };
}

function embedWithFixedEnds(interiorValues: Float64Array): Float64Array {
  const embedded = new Float64Array(interiorValues.length + 2);
  embedded.set(interiorValues, 1);
  return embedded;
}

function computeModeWeights(real: Float64Array, imaginary: Float64Array): Float64Array {
  const weights = new Float64Array(real.length);
  for (let index = 0; index < real.length; index += 1) {
    weights[index] = real[index] * real[index] + imaginary[index] * imaginary[index];
  }
  return weights;
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
