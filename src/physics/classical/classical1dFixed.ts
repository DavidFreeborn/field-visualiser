import {
  computeDirichletClassicalEnergy1D,
  type ClassicalPeriodicEnergyBreakdown1D,
} from '../core/invariants';
import { applyDirichletLaplacian1D } from '../core/operators';
import type {
  SimulationDiagnostics,
  SimulationEngine,
} from '../core/simulation';
import {
  assertFiniteNumber,
  assertModeNumberList,
  assertPositiveFinite,
  assertUnitInterval,
  computeRelativeEnergyDrift,
  computeSubstepCount,
} from '../core/validation';
import {
  CLASSICAL_1D_FIXED_PRESETS,
  createGaussianBumpFixed1D,
  createStandingModesDirichlet1D,
  type Classical1DFixedInitialPreset,
} from './initialConditions';

export interface Classical1DFixedConfig {
  readonly siteCount: number;
  readonly waveSpeed: number;
  readonly domainLength: number;
  readonly amplitude: number;
  readonly initialCenter: number;
  readonly gaussianWidth: number;
  /** Standing-mode numbers used by the 'standing-modes' preset. */
  readonly modeNumbers: readonly number[];
  readonly initialPreset: Classical1DFixedInitialPreset;
}

export type Classical1DFixedQuantity =
  | 'displacement'
  | 'velocity'
  | 'energy-density';

export interface Classical1DFixedSnapshot {
  readonly kind: 'classical-1d-fixed';
  readonly time: number;
  readonly systemLabel: '1D interval';
  readonly boundaryCondition: 'dirichlet';
  readonly modeLabel: 'classical field';
  readonly quantity: Classical1DFixedQuantity;
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

export interface Classical1DFixedDiagnostics extends SimulationDiagnostics {
  readonly totalEnergy: number;
  readonly relativeEnergyDrift: number;
}

const STABILITY_SAFETY_FACTOR = 0.7;

export class Classical1DFixedEngine implements SimulationEngine<
  Classical1DFixedConfig,
  Classical1DFixedSnapshot,
  Classical1DFixedDiagnostics
> {
  private config: Classical1DFixedConfig | null = null;
  private time = 0;
  private spacing = 1;
  private inverseSpacingSquared = 1;
  private displacement = new Float64Array(0);
  private velocity = new Float64Array(0);
  private acceleration = new Float64Array(0);
  private energyBaseline = 1;

  public constructor(config: Classical1DFixedConfig) {
    this.reset(config);
  }

  public reset(config: Classical1DFixedConfig): void {
    assertValidConfig(config);

    this.config = config;
    this.time = 0;
    this.spacing = config.domainLength / (config.siteCount - 1);
    this.inverseSpacingSquared = 1 / (this.spacing * this.spacing);
    this.displacement = new Float64Array(config.siteCount);
    this.velocity = new Float64Array(config.siteCount);
    this.acceleration = new Float64Array(config.siteCount);

    const initialState = createInitialState(config);
    this.displacement.set(initialState.displacement);
    this.velocity.set(initialState.velocity);
    this.enforceBoundaryConditions();
    this.updateAcceleration();
    this.energyBaseline = this.computeEnergy().total;
  }

  public step(dt: number): void {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    const substeps = computeSubstepCount(dt, this.getMaxStableDt() * 0.95);

    if (substeps === 0) {
      return;
    }

    const substepDt = dt / substeps;

    for (let stepIndex = 0; stepIndex < substeps; stepIndex += 1) {
      this.integrateSingleStep(substepDt);
      this.time += substepDt;
    }
  }

  public getSnapshot(
    quantity: Classical1DFixedQuantity = 'displacement',
  ): Classical1DFixedSnapshot {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    const energy = this.computeEnergy();

    return {
      kind: 'classical-1d-fixed',
      time: this.time,
      systemLabel: '1D interval',
      boundaryCondition: 'dirichlet',
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

  public getDiagnostics(): Classical1DFixedDiagnostics {
    const totalEnergy = this.computeEnergy().total;
    const maxStableDt = this.getMaxStableDt();
    const recommendedDt = maxStableDt * STABILITY_SAFETY_FACTOR;

    return {
      maxStableDt,
      recommendedDt,
      stabilityRatio: recommendedDt / maxStableDt,
      totalEnergy,
      relativeEnergyDrift: computeRelativeEnergyDrift(
        this.energyBaseline,
        totalEnergy,
      ),
    };
  }

  private integrateSingleStep(dt: number): void {
    const halfStep = 0.5 * dt;

    for (let index = 1; index < this.velocity.length - 1; index += 1) {
      this.velocity[index] += halfStep * this.acceleration[index];
      this.displacement[index] += dt * this.velocity[index];
    }

    this.enforceBoundaryConditions();
    this.updateAcceleration();

    for (let index = 1; index < this.velocity.length - 1; index += 1) {
      this.velocity[index] += halfStep * this.acceleration[index];
    }

    this.enforceBoundaryConditions();
  }

  private enforceBoundaryConditions(): void {
    this.displacement[0] = 0;
    this.displacement[this.displacement.length - 1] = 0;
    this.velocity[0] = 0;
    this.velocity[this.velocity.length - 1] = 0;
  }

  private updateAcceleration(): void {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    applyDirichletLaplacian1D(
      this.displacement,
      this.inverseSpacingSquared,
      this.acceleration,
    );

    const accelerationScale = this.config.waveSpeed * this.config.waveSpeed;

    for (let index = 1; index < this.acceleration.length - 1; index += 1) {
      this.acceleration[index] *= accelerationScale;
    }
  }

  private computeEnergy(): ClassicalPeriodicEnergyBreakdown1D {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    return computeDirichletClassicalEnergy1D(
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

function createInitialState(config: Classical1DFixedConfig): {
  displacement: Float64Array;
  velocity: Float64Array;
} {
  const displacement = new Float64Array(config.siteCount);
  const velocity = new Float64Array(config.siteCount);

  switch (config.initialPreset) {
    case 'gaussian-displacement':
      // The fixed interval uses the full physical coordinate grid x_j = j/(N-1)
      // with an ordinary, non-wrapped distance.
      displacement.set(
        createGaussianBumpFixed1D(config.siteCount, {
          amplitude: config.amplitude,
          center: config.initialCenter,
          width: config.gaussianWidth,
        }),
      );
      break;
    case 'gaussian-velocity':
      velocity.set(
        createGaussianBumpFixed1D(config.siteCount, {
          amplitude: config.amplitude,
          center: config.initialCenter,
          width: config.gaussianWidth,
        }),
      );
      break;
    case 'single-site-displacement':
      displacement[
        Math.max(
          1,
          Math.min(
            config.siteCount - 2,
            Math.round(config.initialCenter * (config.siteCount - 1)),
          ),
        )
      ] = config.amplitude;
      break;
    case 'standing-modes':
      displacement.set(
        createStandingModesDirichlet1D(
          config.siteCount,
          config.modeNumbers,
          config.amplitude,
        ),
      );
      break;
  }

  displacement[0] = 0;
  displacement[config.siteCount - 1] = 0;
  velocity[0] = 0;
  velocity[config.siteCount - 1] = 0;

  return { displacement, velocity };
}

function assertValidConfig(config: Classical1DFixedConfig): void {
  if (!Number.isInteger(config.siteCount) || config.siteCount < 4) {
    throw new Error('siteCount must be an integer greater than or equal to 4.');
  }

  assertPositiveFinite(config.domainLength, 'domainLength');
  assertPositiveFinite(config.waveSpeed, 'waveSpeed');
  assertPositiveFinite(config.gaussianWidth, 'gaussianWidth');
  assertFiniteNumber(config.amplitude, 'amplitude');
  assertUnitInterval(config.initialCenter, 'initialCenter');

  if (config.initialPreset === 'standing-modes') {
    // Distinct Dirichlet sine modes: 1 .. siteCount - 2.
    assertModeNumberList(
      config.modeNumbers,
      'modeNumbers',
      1,
      config.siteCount - 2,
    );
  }

  if (!CLASSICAL_1D_FIXED_PRESETS.includes(config.initialPreset)) {
    throw new Error(
      `initialPreset '${String(config.initialPreset)}' is not valid for fixed (Dirichlet) ` +
        'endpoints: a globally one-way or zero-mean-corrected state has no meaning there.',
    );
  }
}
