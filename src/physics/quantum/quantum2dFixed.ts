import { flattenIndex2D } from '../core/grids';
import type { SimulationDiagnostics, SimulationEngine } from '../core/simulation';
import { computeDiscreteNorm } from './initialStates';
import {
  createFixedQuantumInitialState2D,
  embedInteriorState,
  extractInteriorState,
  inverseSineTransform2D,
  sineTransform2D,
  type Quantum2DInitialPreset,
} from './initialStates2d';

export interface Quantum2DFixedConfig {
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

export type Quantum2DFixedQuantity =
  | 'probability-density'
  | 'magnitude'
  | 'real-part'
  | 'imaginary-part';

export interface Quantum2DFixedSnapshot {
  readonly kind: 'quantum-2d-fixed';
  readonly time: number;
  readonly systemLabel: '2D square';
  readonly boundaryCondition: 'dirichlet';
  readonly modeLabel: 'free-field one-particle';
  readonly quantity: Quantum2DFixedQuantity;
  readonly width: number;
  readonly height: number;
  readonly domainLength: number;
  readonly spacing: number;
  readonly geometry: 'square-fixed';
  readonly amplitudeReal: Float64Array;
  readonly amplitudeImaginary: Float64Array;
  readonly magnitude: Float64Array;
  readonly probabilityDensity: Float64Array;
  readonly modeWeights: Float64Array;
  readonly totalNorm: number;
}

export interface Quantum2DFixedDiagnostics extends SimulationDiagnostics {
  readonly totalNorm: number;
  readonly normError: number;
}

const PHASE_SAMPLES_PER_FASTEST_PERIOD = 32;

export class Quantum2DFixedEngine
  implements
    SimulationEngine<Quantum2DFixedConfig, Quantum2DFixedSnapshot, Quantum2DFixedDiagnostics>
{
  private config: Quantum2DFixedConfig | null = null;
  private time = 0;
  private spacing = 1;
  private interiorSize = 0;
  private modeFrequencies = new Float64Array(0);
  private modeReal = new Float64Array(0);
  private modeImaginary = new Float64Array(0);
  private siteReal = new Float64Array(0);
  private siteImaginary = new Float64Array(0);

  public constructor(config: Quantum2DFixedConfig) {
    this.reset(config);
  }

  public reset(config: Quantum2DFixedConfig): void {
    assertValidConfig(config);

    this.config = config;
    this.time = 0;
    this.spacing = config.domainLength / (config.size - 1);
    this.interiorSize = config.size - 2;
    this.modeFrequencies = new Float64Array(
      buildModeFrequencies2D(
        this.interiorSize,
        this.spacing,
        config.waveSpeed,
      ),
    );

    const initialSiteState = createFixedQuantumInitialState2D(config.initialPreset, {
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

    const interiorState = extractInteriorState(
      config.size,
      this.siteReal,
      this.siteImaginary,
    );
    const modeState = sineTransform2D(
      interiorState.real,
      interiorState.imaginary,
      this.interiorSize,
    );
    this.modeReal = new Float64Array(modeState.real);
    this.modeImaginary = new Float64Array(modeState.imaginary);
  }

  public step(dt: number): void {
    if (dt <= 0) {
      return;
    }

    for (let index = 0; index < this.modeReal.length; index += 1) {
      const phase = -this.modeFrequencies[index] * dt;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      const real = this.modeReal[index];
      const imaginary = this.modeImaginary[index];
      this.modeReal[index] = real * cosPhase - imaginary * sinPhase;
      this.modeImaginary[index] = real * sinPhase + imaginary * cosPhase;
    }

    const interiorSiteState = inverseSineTransform2D(
      this.modeReal,
      this.modeImaginary,
      this.interiorSize,
    );
    const fullState = embedInteriorState(this.interiorSize + 2, interiorSiteState);
    this.siteReal = new Float64Array(fullState.real);
    this.siteImaginary = new Float64Array(fullState.imaginary);
    this.time += dt;
  }

  public getSnapshot(
    quantity: Quantum2DFixedQuantity = 'probability-density',
  ): Quantum2DFixedSnapshot {
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
      kind: 'quantum-2d-fixed',
      time: this.time,
      systemLabel: '2D square',
      boundaryCondition: 'dirichlet',
      modeLabel: 'free-field one-particle',
      quantity,
      width: this.config.size,
      height: this.config.size,
      domainLength: this.config.domainLength,
      spacing: this.spacing,
      geometry: 'square-fixed',
      amplitudeReal: this.siteReal.slice(),
      amplitudeImaginary: this.siteImaginary.slice(),
      magnitude,
      probabilityDensity,
      modeWeights: computeModeWeights(this.modeReal, this.modeImaginary),
      totalNorm: computeDiscreteNorm(this.siteReal, this.siteImaginary),
    };
  }

  public getDiagnostics(): Quantum2DFixedDiagnostics {
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

function buildModeFrequencies2D(
  interiorSize: number,
  spacing: number,
  waveSpeed: number,
): Float64Array {
  const frequencies = new Float64Array(interiorSize * interiorSize);

  for (let my = 0; my < interiorSize; my += 1) {
    const sinY = Math.sin((Math.PI * (my + 1)) / (2 * (interiorSize + 1)));
    for (let mx = 0; mx < interiorSize; mx += 1) {
      const sinX = Math.sin((Math.PI * (mx + 1)) / (2 * (interiorSize + 1)));
      frequencies[flattenIndex2D(mx, my, interiorSize)] =
        (2 * waveSpeed * Math.sqrt((sinX * sinX) + (sinY * sinY))) / spacing;
    }
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

function assertValidConfig(config: Quantum2DFixedConfig): void {
  if (!Number.isInteger(config.size) || config.size < 5) {
    throw new Error('size must be an integer greater than or equal to 5.');
  }

  if (config.domainLength <= 0 || config.waveSpeed <= 0) {
    throw new Error('domainLength and waveSpeed must be positive.');
  }

  if (config.gaussianWidth <= 0 || config.momentumWidth <= 0) {
    throw new Error('gaussianWidth and momentumWidth must be positive.');
  }
}
