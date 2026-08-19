import { fastDst1Unitary2D } from '../core/fft';
import { flattenIndex2D } from '../core/grids';
import type {
  SimulationDiagnostics,
  SimulationEngine,
} from '../core/simulation';
import {
  assertIntegerInRange,
  assertPositiveFinite,
  assertResolvableQuantumTime,
  assertUnitInterval,
} from '../core/validation';
import { computeDiscreteNorm } from './initialStates';
import type { Quantum2DDisplaySnapshot } from './quantum2dDisplay';
import {
  createFixedQuantumInitialState2D,
  embedInteriorState,
  extractInteriorState,
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
  | 'imaginary-part'
  | 'phase-magnitude';

export interface Quantum2DFixedSnapshot {
  readonly kind: 'quantum-2d-fixed';
  readonly time: number;
  readonly systemLabel: '2D square';
  readonly boundaryCondition: 'dirichlet';
  readonly modeLabel: 'square-root lattice quantum model';
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

export class Quantum2DFixedEngine implements SimulationEngine<
  Quantum2DFixedConfig,
  Quantum2DFixedSnapshot,
  Quantum2DFixedDiagnostics
> {
  private config: Quantum2DFixedConfig | null = null;
  private time = 0;
  private spacing = 1;
  private interiorSize = 0;
  private maximumFrequency = 0;
  private modeFrequencies = new Float64Array(0);

  /** Number of inverse transforms performed since construction (test instrumentation). */
  public inverseTransformCount = 0;
  private initialModeReal = new Float64Array(0);
  private initialModeImaginary = new Float64Array(0);
  private modeReal = new Float64Array(0);
  private modeImaginary = new Float64Array(0);
  private siteReal = new Float64Array(0);
  private siteImaginary = new Float64Array(0);
  private interiorReal = new Float64Array(0);
  private interiorImaginary = new Float64Array(0);
  private magnitude = new Float64Array(0);
  private probabilityDensity = new Float64Array(0);
  private modeWeights = new Float64Array(0);

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
      buildModeFrequencies2D(this.interiorSize, this.spacing, config.waveSpeed),
    );

    const initialSiteState = createFixedQuantumInitialState2D(
      config.initialPreset,
      {
        size: config.size,
        centerX: config.initialCenterX,
        centerY: config.initialCenterY,
        gaussianWidth: config.gaussianWidth,
        momentumWidth: config.momentumWidth,
        modeNumberX: config.modeNumberX,
        modeNumberY: config.modeNumberY,
      },
    );

    this.siteReal = new Float64Array(initialSiteState.real);
    this.siteImaginary = new Float64Array(initialSiteState.imaginary);
    this.magnitude = new Float64Array(initialSiteState.real.length);
    this.probabilityDensity = new Float64Array(initialSiteState.real.length);
    this.modeWeights = new Float64Array(this.interiorSize * this.interiorSize);
    this.interiorReal = new Float64Array(this.interiorSize * this.interiorSize);
    this.interiorImaginary = new Float64Array(
      this.interiorSize * this.interiorSize,
    );

    extractInteriorState(
      config.size,
      this.siteReal,
      this.siteImaginary,
      this.interiorReal,
      this.interiorImaginary,
    );
    this.modeReal = new Float64Array(this.interiorSize * this.interiorSize);
    this.modeImaginary = new Float64Array(
      this.interiorSize * this.interiorSize,
    );
    fastDst1Unitary2D(
      this.interiorReal,
      this.interiorImaginary,
      this.interiorSize,
      this.modeReal,
      this.modeImaginary,
    );
    this.initialModeReal = new Float64Array(this.modeReal);
    this.initialModeImaginary = new Float64Array(this.modeImaginary);
    this.maximumFrequency = this.modeFrequencies.reduce(
      (currentMax, frequency) => Math.max(currentMax, frequency),
      0,
    );
  }

  public step(dt: number): void {
    if (!Number.isFinite(dt)) {
      throw new Error(`dt must be a finite number, received ${String(dt)}.`);
    }

    if (dt <= 0) {
      return;
    }

    this.setTime(this.time + dt);
  }

  public setTime(time: number): void {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    assertResolvableQuantumTime(time, this.maximumFrequency);
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

    fastDst1Unitary2D(
      this.modeReal,
      this.modeImaginary,
      this.interiorSize,
      this.interiorReal,
      this.interiorImaginary,
    );
    this.inverseTransformCount += 1;
    embedInteriorState(
      this.interiorSize + 2,
      {
        real: this.interiorReal,
        imaginary: this.interiorImaginary,
      },
      this.siteReal,
      this.siteImaginary,
    );
  }

  public getSnapshot(
    quantity: Quantum2DFixedQuantity = 'probability-density',
  ): Quantum2DFixedSnapshot {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    for (let index = 0; index < this.siteReal.length; index += 1) {
      const amplitudeSquared =
        this.siteReal[index] * this.siteReal[index] +
        this.siteImaginary[index] * this.siteImaginary[index];
      this.magnitude[index] = Math.sqrt(amplitudeSquared);
      this.probabilityDensity[index] = amplitudeSquared;
    }

    for (let index = 0; index < this.modeReal.length; index += 1) {
      this.modeWeights[index] =
        this.modeReal[index] * this.modeReal[index] +
        this.modeImaginary[index] * this.modeImaginary[index];
    }

    return {
      kind: 'quantum-2d-fixed',
      time: this.time,
      systemLabel: '2D square',
      boundaryCondition: 'dirichlet',
      modeLabel: 'square-root lattice quantum model',
      quantity,
      width: this.config.size,
      height: this.config.size,
      domainLength: this.config.domainLength,
      spacing: this.spacing,
      geometry: 'square-fixed',
      amplitudeReal: this.siteReal.slice(),
      amplitudeImaginary: this.siteImaginary.slice(),
      magnitude: this.magnitude.slice(),
      probabilityDensity: this.probabilityDensity.slice(),
      modeWeights: this.modeWeights.slice(),
      totalNorm: computeDiscreteNorm(this.siteReal, this.siteImaginary),
    };
  }

  public getDiagnostics(): Quantum2DFixedDiagnostics {
    const totalNorm = computeDiscreteNorm(this.modeReal, this.modeImaginary);
    const recommendedDt =
      this.maximumFrequency > 0
        ? (2 * Math.PI) /
          (this.maximumFrequency * PHASE_SAMPLES_PER_FASTEST_PERIOD)
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
    quantity: Quantum2DFixedQuantity = 'probability-density',
    target?: Float32Array,
    auxTarget?: Float32Array,
  ): Quantum2DDisplaySnapshot {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    const displayValues =
      target !== undefined && target.length === this.siteReal.length
        ? target
        : new Float32Array(this.siteReal.length);
    let displayValuesAux: Float32Array | undefined;

    if (quantity === 'phase-magnitude') {
      displayValuesAux =
        auxTarget !== undefined && auxTarget.length === this.siteReal.length
          ? auxTarget
          : new Float32Array(this.siteReal.length);
      for (let index = 0; index < this.siteReal.length; index += 1) {
        displayValues[index] = Math.atan2(
          this.siteImaginary[index],
          this.siteReal[index],
        );
        displayValuesAux[index] = Math.hypot(
          this.siteReal[index],
          this.siteImaginary[index],
        );
      }
    } else {
      for (let index = 0; index < this.siteReal.length; index += 1) {
        switch (quantity) {
          case 'real-part':
            displayValues[index] = this.siteReal[index];
            break;
          case 'imaginary-part':
            displayValues[index] = this.siteImaginary[index];
            break;
          case 'magnitude':
            displayValues[index] = Math.hypot(
              this.siteReal[index],
              this.siteImaginary[index],
            );
            break;
          case 'probability-density':
          default:
            displayValues[index] =
              this.siteReal[index] * this.siteReal[index] +
              this.siteImaginary[index] * this.siteImaginary[index];
            break;
        }
      }
    }

    return {
      kind: 'quantum-2d-display',
      sourceKind: 'quantum-2d-fixed',
      time: this.time,
      systemLabel: '2D square',
      boundaryCondition: 'dirichlet',
      modeLabel: 'square-root lattice quantum model',
      quantity,
      width: this.config.size,
      height: this.config.size,
      domainLength: this.config.domainLength,
      spacing: this.spacing,
      geometry: 'square-fixed',
      displayValues,
      ...(displayValuesAux !== undefined ? { displayValuesAux } : {}),
      totalNorm: computeDiscreteNorm(this.siteReal, this.siteImaginary),
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
        (2 * waveSpeed * Math.sqrt(sinX * sinX + sinY * sinY)) / spacing;
    }
  }

  return frequencies;
}
function assertValidConfig(config: Quantum2DFixedConfig): void {
  if (!Number.isInteger(config.size) || config.size < 5) {
    throw new Error('size must be an integer greater than or equal to 5.');
  }

  assertPositiveFinite(config.domainLength, 'domainLength');
  assertPositiveFinite(config.waveSpeed, 'waveSpeed');
  assertPositiveFinite(config.gaussianWidth, 'gaussianWidth');
  assertPositiveFinite(config.momentumWidth, 'momentumWidth');
  assertUnitInterval(config.initialCenterX, 'initialCenterX');
  assertUnitInterval(config.initialCenterY, 'initialCenterY');

  // Carrier zero is valid for a Gaussian; a selected normal mode requires
  // 1 .. size - 2 in both directions (checked again at construction).
  const minimumMode = config.initialPreset === 'selected-normal-mode' ? 1 : 0;
  assertIntegerInRange(
    config.modeNumberX,
    'modeNumberX',
    minimumMode,
    config.size - 2,
  );
  assertIntegerInRange(
    config.modeNumberY,
    'modeNumberY',
    minimumMode,
    config.size - 2,
  );
}
