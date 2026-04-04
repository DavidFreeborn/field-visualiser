import { flattenIndex2D } from '../core/grids';
import type { SimulationDiagnostics, SimulationEngine } from '../core/simulation';
import { computeDiscreteNorm } from './initialStates';
import type { Quantum2DDisplaySnapshot } from './quantum2dDisplay';
import {
  createPeriodicQuantumInitialState2D,
  discreteFourierTransform2D,
  inverseDiscreteFourierTransform2D,
  type Quantum2DInitialPreset,
} from './initialStates2d';

export interface Quantum2DPeriodicConfig {
  readonly size: number;
  readonly waveSpeed: number;
  readonly domainLength: number;
  readonly initialCenterX: number;
  readonly initialCenterY: number;
  readonly gaussianWidth: number;
  readonly momentumWidth: number;
  readonly modeNumberX: number;
  readonly modeNumberY: number;
  readonly initialPreset: Quantum2DInitialPreset;
}

export type Quantum2DPeriodicQuantity =
  | 'probability-density'
  | 'magnitude'
  | 'real-part'
  | 'imaginary-part';

export interface Quantum2DPeriodicSnapshot {
  readonly kind: 'quantum-2d-periodic';
  readonly time: number;
  readonly systemLabel: '2D torus';
  readonly boundaryCondition: 'periodic';
  readonly modeLabel: 'free-field one-particle';
  readonly quantity: Quantum2DPeriodicQuantity;
  readonly width: number;
  readonly height: number;
  readonly domainLength: number;
  readonly spacing: number;
  readonly geometry: 'torus-periodic';
  readonly amplitudeReal: Float64Array;
  readonly amplitudeImaginary: Float64Array;
  readonly magnitude: Float64Array;
  readonly probabilityDensity: Float64Array;
  readonly modeWeights: Float64Array;
  readonly totalNorm: number;
}

export interface Quantum2DPeriodicDiagnostics extends SimulationDiagnostics {
  readonly totalNorm: number;
  readonly normError: number;
}

const PHASE_SAMPLES_PER_FASTEST_PERIOD = 32;

export class Quantum2DPeriodicEngine
  implements
    SimulationEngine<
      Quantum2DPeriodicConfig,
      Quantum2DPeriodicSnapshot,
      Quantum2DPeriodicDiagnostics
    >
{
  private config: Quantum2DPeriodicConfig | null = null;
  private time = 0;
  private spacing = 1;
  private modeFrequencies = new Float64Array(0);
  private initialModeReal = new Float64Array(0);
  private initialModeImaginary = new Float64Array(0);
  private modeReal = new Float64Array(0);
  private modeImaginary = new Float64Array(0);
  private siteReal = new Float64Array(0);
  private siteImaginary = new Float64Array(0);
  private magnitude = new Float64Array(0);
  private probabilityDensity = new Float64Array(0);
  private modeWeights = new Float64Array(0);

  public constructor(config: Quantum2DPeriodicConfig) {
    this.reset(config);
  }

  public reset(config: Quantum2DPeriodicConfig): void {
    assertValidConfig(config);

    this.config = config;
    this.time = 0;
    this.spacing = config.domainLength / config.size;
    this.modeFrequencies = new Float64Array(
      buildModeFrequencies2D(config.size, this.spacing, config.waveSpeed),
    );

    const initialSiteState = createPeriodicQuantumInitialState2D(config.initialPreset, {
      size: config.size,
      centerX: config.initialCenterX,
      centerY: config.initialCenterY,
      gaussianWidth: config.gaussianWidth,
      momentumWidth: config.momentumWidth,
      modeNumberX: config.modeNumberX,
      modeNumberY: config.modeNumberY,
    });

    this.siteReal = new Float64Array(initialSiteState.real);
    this.siteImaginary = new Float64Array(initialSiteState.imaginary);
    this.magnitude = new Float64Array(initialSiteState.real.length);
    this.probabilityDensity = new Float64Array(initialSiteState.real.length);
    this.modeWeights = new Float64Array(initialSiteState.real.length);

    this.modeReal = new Float64Array(initialSiteState.real.length);
    this.modeImaginary = new Float64Array(initialSiteState.real.length);
    discreteFourierTransform2D(
      this.siteReal,
      this.siteImaginary,
      config.size,
      this.modeReal,
      this.modeImaginary,
    );
    this.initialModeReal = new Float64Array(this.modeReal);
    this.initialModeImaginary = new Float64Array(this.modeImaginary);
  }

  public step(dt: number): void {
    if (dt <= 0) {
      return;
    }

    this.setTime(this.time + dt);
  }

  public setTime(time: number): void {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    this.time = Math.max(0, time);

    for (let index = 0; index < this.modeReal.length; index += 1) {
      const phase = -this.modeFrequencies[index] * this.time;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      const real = this.initialModeReal[index];
      const imaginary = this.initialModeImaginary[index];
      this.modeReal[index] = real * cosPhase - imaginary * sinPhase;
      this.modeImaginary[index] = real * sinPhase + imaginary * cosPhase;
    }

    inverseDiscreteFourierTransform2D(
      this.modeReal,
      this.modeImaginary,
      this.config.size,
      this.siteReal,
      this.siteImaginary,
    );
  }

  public getSnapshot(
    quantity: Quantum2DPeriodicQuantity = 'probability-density',
  ): Quantum2DPeriodicSnapshot {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    for (let index = 0; index < this.siteReal.length; index += 1) {
      const amplitudeSquared =
        this.siteReal[index] * this.siteReal[index] +
        this.siteImaginary[index] * this.siteImaginary[index];
      this.magnitude[index] = Math.sqrt(amplitudeSquared);
      this.probabilityDensity[index] = amplitudeSquared;
      this.modeWeights[index] =
        this.modeReal[index] * this.modeReal[index] +
        this.modeImaginary[index] * this.modeImaginary[index];
    }

    return {
      kind: 'quantum-2d-periodic',
      time: this.time,
      systemLabel: '2D torus',
      boundaryCondition: 'periodic',
      modeLabel: 'free-field one-particle',
      quantity,
      width: this.config.size,
      height: this.config.size,
      domainLength: this.config.domainLength,
      spacing: this.spacing,
      geometry: 'torus-periodic',
      amplitudeReal: this.siteReal.slice(),
      amplitudeImaginary: this.siteImaginary.slice(),
      magnitude: this.magnitude.slice(),
      probabilityDensity: this.probabilityDensity.slice(),
      modeWeights: this.modeWeights.slice(),
      totalNorm: computeDiscreteNorm(this.siteReal, this.siteImaginary),
    };
  }

  public getDiagnostics(): Quantum2DPeriodicDiagnostics {
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

  public getDisplaySnapshot(
    quantity: Quantum2DPeriodicQuantity = 'probability-density',
  ): Quantum2DDisplaySnapshot {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    const displayValues = new Float32Array(this.siteReal.length);

    for (let index = 0; index < this.siteReal.length; index += 1) {
      switch (quantity) {
        case 'real-part':
          displayValues[index] = this.siteReal[index];
          break;
        case 'imaginary-part':
          displayValues[index] = this.siteImaginary[index];
          break;
        case 'magnitude':
          displayValues[index] = Math.hypot(this.siteReal[index], this.siteImaginary[index]);
          break;
        case 'probability-density':
        default:
          displayValues[index] =
            this.siteReal[index] * this.siteReal[index] +
            this.siteImaginary[index] * this.siteImaginary[index];
          break;
      }
    }

    return {
      kind: 'quantum-2d-display',
      sourceKind: 'quantum-2d-periodic',
      time: this.time,
      systemLabel: '2D torus',
      boundaryCondition: 'periodic',
      modeLabel: 'free-field one-particle',
      quantity,
      width: this.config.size,
      height: this.config.size,
      domainLength: this.config.domainLength,
      spacing: this.spacing,
      geometry: 'torus-periodic',
      displayValues,
      totalNorm: computeDiscreteNorm(this.siteReal, this.siteImaginary),
    };
  }
}

function buildModeFrequencies2D(
  size: number,
  spacing: number,
  waveSpeed: number,
): Float64Array {
  const frequencies = new Float64Array(size * size);

  for (let ky = 0; ky < size; ky += 1) {
    const sinY = Math.sin((Math.PI * ky) / size);
    for (let kx = 0; kx < size; kx += 1) {
      const sinX = Math.sin((Math.PI * kx) / size);
      frequencies[flattenIndex2D(kx, ky, size)] =
        (2 * waveSpeed * Math.sqrt((sinX * sinX) + (sinY * sinY))) / spacing;
    }
  }

  return frequencies;
}
function assertValidConfig(config: Quantum2DPeriodicConfig): void {
  if (!Number.isInteger(config.size) || config.size < 8) {
    throw new Error('size must be an integer greater than or equal to 8.');
  }

  if (config.domainLength <= 0 || config.waveSpeed <= 0) {
    throw new Error('domainLength and waveSpeed must be positive.');
  }

  if (config.gaussianWidth <= 0 || config.momentumWidth <= 0) {
    throw new Error('gaussianWidth and momentumWidth must be positive.');
  }
}
