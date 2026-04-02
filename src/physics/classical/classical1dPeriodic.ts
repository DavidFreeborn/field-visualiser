import {
  computePeriodicClassicalEnergy1D,
  type ClassicalPeriodicEnergyBreakdown1D,
} from '../core/invariants';
import { applyPeriodicLaplacian1D } from '../core/operators';
import type { SimulationDiagnostics, SimulationEngine } from '../core/simulation';
import {
  createGaussianBump1D,
  createStandingMode1D,
  type PeriodicClassicalInitialPreset,
} from './initialConditions';

export interface Classical1DPeriodicConfig {
  readonly siteCount: number;
  readonly waveSpeed: number;
  readonly domainLength: number;
  readonly amplitude: number;
  readonly gaussianWidth: number;
  readonly initialPreset: PeriodicClassicalInitialPreset;
}

export type Classical1DPeriodicQuantity = 'displacement' | 'velocity' | 'energy-density';

export interface Classical1DPeriodicSnapshot {
  readonly time: number;
  readonly systemLabel: '1D circle';
  readonly boundaryCondition: 'periodic';
  readonly modeLabel: 'classical field';
  readonly quantity: Classical1DPeriodicQuantity;
  readonly siteCount: number;
  readonly domainLength: number;
  readonly spacing: number;
  readonly displacement: Float64Array;
  readonly velocity: Float64Array;
  readonly localEnergyDensity: Float64Array;
  readonly totalEnergy: number;
  readonly kineticEnergy: number;
  readonly potentialEnergy: number;
}

export interface Classical1DPeriodicDiagnostics extends SimulationDiagnostics {
  readonly totalEnergy: number;
  readonly relativeEnergyDrift: number;
}

const STABILITY_SAFETY_FACTOR = 0.7;

export class Classical1DPeriodicEngine
  implements
    SimulationEngine<
      Classical1DPeriodicConfig,
      Classical1DPeriodicSnapshot,
      Classical1DPeriodicDiagnostics
    >
{
  private config: Classical1DPeriodicConfig | null = null;

  private time = 0;

  private spacing = 1;

  private inverseSpacingSquared = 1;

  private displacement = new Float64Array(0);

  private velocity = new Float64Array(0);

  private acceleration = new Float64Array(0);

  private energyBaseline = 1;

  public constructor(config: Classical1DPeriodicConfig) {
    this.reset(config);
  }

  public reset(config: Classical1DPeriodicConfig): void {
    assertValidConfig(config);

    this.config = config;
    this.time = 0;
    this.spacing = config.domainLength / config.siteCount;
    this.inverseSpacingSquared = 1 / (this.spacing * this.spacing);
    this.displacement = new Float64Array(config.siteCount);
    this.velocity = new Float64Array(config.siteCount);
    this.acceleration = new Float64Array(config.siteCount);

    const initialState = createInitialState(config);
    this.displacement.set(initialState.displacement);
    this.velocity.set(initialState.velocity);
    this.updateAcceleration();
    this.energyBaseline = this.computeEnergy().total;
  }

  public step(dt: number): void {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    if (dt <= 0) {
      return;
    }

    const maxStableDt = this.getMaxStableDt();
    const substeps = Math.max(1, Math.ceil(dt / (maxStableDt * 0.95)));
    const substepDt = dt / substeps;

    for (let stepIndex = 0; stepIndex < substeps; stepIndex += 1) {
      this.integrateSingleStep(substepDt);
      this.time += substepDt;
    }
  }

  public getSnapshot(
    quantity: Classical1DPeriodicQuantity = 'displacement',
  ): Classical1DPeriodicSnapshot {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    const energy = this.computeEnergy();

    return {
      time: this.time,
      systemLabel: '1D circle',
      boundaryCondition: 'periodic',
      modeLabel: 'classical field',
      quantity,
      siteCount: this.config.siteCount,
      domainLength: this.config.domainLength,
      spacing: this.spacing,
      displacement: this.displacement.slice(),
      velocity: this.velocity.slice(),
      localEnergyDensity: energy.localDensity,
      totalEnergy: energy.total,
      kineticEnergy: energy.kinetic,
      potentialEnergy: energy.potential,
    };
  }

  public getDiagnostics(): Classical1DPeriodicDiagnostics {
    const totalEnergy = this.computeEnergy().total;
    const maxStableDt = this.getMaxStableDt();
    const recommendedDt = maxStableDt * STABILITY_SAFETY_FACTOR;

    return {
      maxStableDt,
      recommendedDt,
      stabilityRatio: recommendedDt / maxStableDt,
      totalEnergy,
      relativeEnergyDrift: Math.abs(totalEnergy - this.energyBaseline) / this.energyBaseline,
    };
  }

  private integrateSingleStep(dt: number): void {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    const halfStep = 0.5 * dt;

    for (let index = 0; index < this.velocity.length; index += 1) {
      this.velocity[index] += halfStep * this.acceleration[index];
      this.displacement[index] += dt * this.velocity[index];
    }

    this.updateAcceleration();

    for (let index = 0; index < this.velocity.length; index += 1) {
      this.velocity[index] += halfStep * this.acceleration[index];
    }
  }

  private updateAcceleration(): void {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    applyPeriodicLaplacian1D(this.displacement, this.inverseSpacingSquared, this.acceleration);

    const accelerationScale = this.config.waveSpeed * this.config.waveSpeed;

    for (let index = 0; index < this.acceleration.length; index += 1) {
      this.acceleration[index] *= accelerationScale;
    }
  }

  private computeEnergy(): ClassicalPeriodicEnergyBreakdown1D {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    return computePeriodicClassicalEnergy1D(
      this.displacement,
      this.velocity,
      this.spacing,
      this.config.waveSpeed,
    );
  }

  private getMaxStableDt(): number {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    return this.spacing / this.config.waveSpeed;
  }
}

function createInitialState(config: Classical1DPeriodicConfig): {
  displacement: Float64Array;
  velocity: Float64Array;
} {
  const displacement = new Float64Array(config.siteCount);
  const velocity = new Float64Array(config.siteCount);

  switch (config.initialPreset) {
    case 'gaussian-displacement':
      displacement.set(
        createGaussianBump1D(config.siteCount, {
          amplitude: config.amplitude,
          center: 0.5,
          width: config.gaussianWidth,
        }),
      );
      break;
    case 'gaussian-velocity':
      velocity.set(
        createGaussianBump1D(config.siteCount, {
          amplitude: config.amplitude,
          center: 0.5,
          width: config.gaussianWidth,
        }),
      );
      break;
    case 'single-site-displacement':
      displacement[Math.floor(config.siteCount / 2)] = config.amplitude;
      break;
    case 'standing-mode-2':
      displacement.set(createStandingMode1D(config.siteCount, 2, config.amplitude));
      break;
  }

  return { displacement, velocity };
}

function assertValidConfig(config: Classical1DPeriodicConfig): void {
  if (!Number.isInteger(config.siteCount) || config.siteCount < 8) {
    throw new Error('siteCount must be an integer greater than or equal to 8.');
  }

  if (config.domainLength <= 0 || config.waveSpeed <= 0) {
    throw new Error('domainLength and waveSpeed must be positive.');
  }

  if (config.gaussianWidth <= 0) {
    throw new Error('gaussianWidth must be positive.');
  }
}
