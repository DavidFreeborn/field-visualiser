import { flattenIndex2D, assertSquareResolution } from '../core/grids';
import type {
  SimulationDiagnostics,
  SimulationEngine,
} from '../core/simulation';
import {
  assertFiniteNumber,
  assertPositiveFinite,
  computeRelativeEnergyDrift,
  computeSubstepCount,
} from '../core/validation';

export type Classical2DGeometry = 'square-fixed' | 'torus-periodic';
export type Classical2DInitialPreset =
  | 'central-gaussian-displacement'
  | 'central-gaussian-velocity'
  | 'zero-mean-gaussian-velocity'
  | 'square-standing-mode-1-1'
  | 'wraparound-pulse'
  | 'compact-pulse';
export type Classical2DQuantity =
  | 'displacement'
  | 'velocity'
  | 'energy-density';

/** The uniform (zero) mode only exists on the periodic torus, and a globally
 * mean-subtracted state conflicts with pinned edges, so the zero-mean preset
 * is torus-only. The wraparound pulse is likewise a periodic-topology preset. */
export const CLASSICAL_2D_TORUS_PRESETS: readonly Classical2DInitialPreset[] = [
  'central-gaussian-displacement',
  'central-gaussian-velocity',
  'zero-mean-gaussian-velocity',
  'wraparound-pulse',
  'compact-pulse',
];

export const CLASSICAL_2D_SQUARE_PRESETS: readonly Classical2DInitialPreset[] =
  [
    'central-gaussian-displacement',
    'central-gaussian-velocity',
    'square-standing-mode-1-1',
    'compact-pulse',
  ];

export interface Classical2DConfig {
  readonly geometry: Classical2DGeometry;
  readonly size: number;
  readonly waveSpeed: number;
  readonly domainLength: number;
  readonly amplitude: number;
  readonly gaussianWidth: number;
  readonly initialPreset: Classical2DInitialPreset;
}

export interface Classical2DSnapshot {
  readonly kind: 'classical-2d';
  readonly time: number;
  readonly systemLabel: '2D square' | '2D torus';
  readonly boundaryCondition: 'dirichlet' | 'periodic';
  readonly modeLabel: 'classical field';
  readonly quantity: Classical2DQuantity;
  readonly width: number;
  readonly height: number;
  readonly domainLength: number;
  readonly spacing: number;
  readonly geometry: Classical2DGeometry;
  readonly displacement: Float64Array;
  readonly velocity: Float64Array;
  readonly localEnergyDensity: Float64Array;
  readonly totalEnergy: number;
  readonly kineticEnergy: number;
  readonly potentialEnergy: number;
}

export interface Classical2DDiagnostics extends SimulationDiagnostics {
  readonly totalEnergy: number;
  readonly relativeEnergyDrift: number;
}

const STABILITY_SAFETY_FACTOR = 0.2;

export class Classical2DEngine implements SimulationEngine<
  Classical2DConfig,
  Classical2DSnapshot,
  Classical2DDiagnostics
> {
  private config: Classical2DConfig | null = null;
  private time = 0;
  private spacing = 1;
  private inverseSpacingSquared = 1;
  private displacement = new Float64Array(0);
  private velocity = new Float64Array(0);
  private acceleration = new Float64Array(0);
  private energyBaseline = 1;

  public constructor(config: Classical2DConfig) {
    this.reset(config);
  }

  public reset(config: Classical2DConfig): void {
    assertValidConfig(config);

    this.config = config;
    this.time = 0;
    this.spacing =
      config.domainLength /
      (config.geometry === 'square-fixed' ? config.size - 1 : config.size);
    this.inverseSpacingSquared = 1 / (this.spacing * this.spacing);
    const siteCount = config.size * config.size;
    this.displacement = new Float64Array(siteCount);
    this.velocity = new Float64Array(siteCount);
    this.acceleration = new Float64Array(siteCount);

    createInitialState(config, this.displacement, this.velocity);
    if (config.geometry === 'square-fixed') {
      enforceFixedBoundary2D(this.displacement, config.size);
      enforceFixedBoundary2D(this.velocity, config.size);
    }

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
    quantity: Classical2DQuantity = 'displacement',
  ): Classical2DSnapshot {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    const energy = this.computeEnergy();

    return {
      kind: 'classical-2d',
      time: this.time,
      systemLabel:
        this.config.geometry === 'square-fixed' ? '2D square' : '2D torus',
      boundaryCondition:
        this.config.geometry === 'square-fixed' ? 'dirichlet' : 'periodic',
      modeLabel: 'classical field',
      quantity,
      width: this.config.size,
      height: this.config.size,
      domainLength: this.config.domainLength,
      spacing: this.spacing,
      geometry: this.config.geometry,
      displacement: this.displacement.slice(),
      velocity: this.velocity.slice(),
      localEnergyDensity: energy.localDensity,
      totalEnergy: energy.total,
      kineticEnergy: energy.kinetic,
      potentialEnergy: energy.potential,
    };
  }

  public getDiagnostics(): Classical2DDiagnostics {
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
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    const size = this.config.size;
    const halfStep = 0.5 * dt;

    for (let index = 0; index < this.velocity.length; index += 1) {
      this.velocity[index] += halfStep * this.acceleration[index];
      this.displacement[index] += dt * this.velocity[index];
    }

    if (this.config.geometry === 'square-fixed') {
      enforceFixedBoundary2D(this.displacement, size);
    }

    this.updateAcceleration();

    for (let index = 0; index < this.velocity.length; index += 1) {
      this.velocity[index] += halfStep * this.acceleration[index];
    }

    if (this.config.geometry === 'square-fixed') {
      enforceFixedBoundary2D(this.velocity, size);
    }
  }

  private updateAcceleration(): void {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    if (this.config.geometry === 'square-fixed') {
      applyDirichletLaplacian2D(
        this.displacement,
        this.config.size,
        this.inverseSpacingSquared,
        this.acceleration,
      );
    } else {
      applyPeriodicLaplacian2D(
        this.displacement,
        this.config.size,
        this.inverseSpacingSquared,
        this.acceleration,
      );
    }

    const accelerationScale = this.config.waveSpeed * this.config.waveSpeed;
    for (let index = 0; index < this.acceleration.length; index += 1) {
      this.acceleration[index] *= accelerationScale;
    }
  }

  private computeEnergy(): {
    total: number;
    kinetic: number;
    potential: number;
    localDensity: Float64Array;
  } {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    return computeEnergy2D(
      this.displacement,
      this.velocity,
      this.config.size,
      this.spacing,
      this.config.waveSpeed,
      this.config.geometry,
    );
  }

  private getMaxStableDt(): number {
    if (this.config === null) {
      throw new Error('Engine has not been initialised.');
    }

    return this.spacing / (Math.SQRT2 * this.config.waveSpeed);
  }
}

export function applyPeriodicLaplacian2D(
  field: Float64Array,
  size: number,
  inverseSpacingSquared: number,
  out: Float64Array = new Float64Array(field.length),
): Float64Array {
  for (let y = 0; y < size; y += 1) {
    const up = (y - 1 + size) % size;
    const down = (y + 1) % size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = flattenIndex2D(x, y, size);
      out[index] =
        (field[flattenIndex2D(left, y, size)] +
          field[flattenIndex2D(right, y, size)] +
          field[flattenIndex2D(x, up, size)] +
          field[flattenIndex2D(x, down, size)] -
          4 * field[index]) *
        inverseSpacingSquared;
    }
  }
  return out;
}

export function applyDirichletLaplacian2D(
  field: Float64Array,
  size: number,
  inverseSpacingSquared: number,
  out: Float64Array = new Float64Array(field.length),
): Float64Array {
  out.fill(0);
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const index = flattenIndex2D(x, y, size);
      out[index] =
        (field[flattenIndex2D(x - 1, y, size)] +
          field[flattenIndex2D(x + 1, y, size)] +
          field[flattenIndex2D(x, y - 1, size)] +
          field[flattenIndex2D(x, y + 1, size)] -
          4 * field[index]) *
        inverseSpacingSquared;
    }
  }
  return out;
}

function createInitialState(
  config: Classical2DConfig,
  displacement: Float64Array,
  velocity: Float64Array,
): void {
  const periodic = config.geometry === 'torus-periodic';
  const center =
    periodic && config.initialPreset === 'wraparound-pulse' ? 0.08 : 0.5;

  switch (config.initialPreset) {
    case 'central-gaussian-displacement':
    case 'wraparound-pulse':
      fillGaussian2D(
        displacement,
        config.size,
        center,
        center,
        config.gaussianWidth,
        config.amplitude,
        periodic,
      );
      break;
    case 'central-gaussian-velocity':
      fillGaussian2D(
        velocity,
        config.size,
        0.5,
        0.5,
        config.gaussianWidth,
        config.amplitude,
        periodic,
      );
      break;
    case 'zero-mean-gaussian-velocity':
      // Torus only: subtracting the exact discrete mean leaves the periodic
      // uniform (zero-frequency) mode exactly unexcited.
      fillGaussian2D(
        velocity,
        config.size,
        0.5,
        0.5,
        config.gaussianWidth,
        config.amplitude,
        periodic,
      );
      subtractMean(velocity);
      break;
    case 'square-standing-mode-1-1':
      fillStandingModeSquare(displacement, config.size, 1, 1, config.amplitude);
      break;
    case 'compact-pulse':
      fillCompactPulse2D(displacement, config.size, config.amplitude);
      break;
  }
}

function fillGaussian2D(
  target: Float64Array,
  size: number,
  centerX: number,
  centerY: number,
  width: number,
  amplitude: number,
  periodic: boolean,
): void {
  // Periodic torus: sites sample x/size and displacement wraps through the
  // seam. Fixed square: full coordinate grid x/(size-1), ordinary distance.
  const denominator = periodic ? size : size - 1;

  for (let y = 0; y < size; y += 1) {
    const normalizedY = y / denominator;
    const deltaY = periodic
      ? shortestPeriodicDelta(normalizedY, centerY)
      : normalizedY - centerY;
    for (let x = 0; x < size; x += 1) {
      const normalizedX = x / denominator;
      const deltaX = periodic
        ? shortestPeriodicDelta(normalizedX, centerX)
        : normalizedX - centerX;
      target[flattenIndex2D(x, y, size)] =
        amplitude *
        Math.exp(
          -0.5 * ((deltaX * deltaX + deltaY * deltaY) / (width * width)),
        );
    }
  }
}

function shortestPeriodicDelta(position: number, center: number): number {
  const rawDelta = position - center;
  return rawDelta - Math.round(rawDelta);
}

function subtractMean(values: Float64Array): void {
  let total = 0;
  for (const value of values) total += value;
  const mean = total / values.length;
  for (let index = 0; index < values.length; index += 1) values[index] -= mean;
}

function fillCompactPulse2D(
  target: Float64Array,
  size: number,
  amplitude: number,
): void {
  const center = (size - 1) / 2;
  const radius = size * 0.08;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      if (dx * dx + dy * dy <= radius * radius) {
        target[flattenIndex2D(x, y, size)] = amplitude;
      }
    }
  }
}

function fillStandingModeSquare(
  target: Float64Array,
  size: number,
  modeX: number,
  modeY: number,
  amplitude: number,
): void {
  const denominator = size - 1;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      target[flattenIndex2D(x, y, size)] =
        amplitude *
        Math.sin((Math.PI * modeX * x) / denominator) *
        Math.sin((Math.PI * modeY * y) / denominator);
    }
  }
}

function enforceFixedBoundary2D(field: Float64Array, size: number): void {
  for (let x = 0; x < size; x += 1) {
    field[flattenIndex2D(x, 0, size)] = 0;
    field[flattenIndex2D(x, size - 1, size)] = 0;
  }
  for (let y = 0; y < size; y += 1) {
    field[flattenIndex2D(0, y, size)] = 0;
    field[flattenIndex2D(size - 1, y, size)] = 0;
  }
}

function computeEnergy2D(
  displacement: Float64Array,
  velocity: Float64Array,
  size: number,
  spacing: number,
  waveSpeed: number,
  geometry: Classical2DGeometry,
): {
  total: number;
  kinetic: number;
  potential: number;
  localDensity: Float64Array;
} {
  const localDensity = new Float64Array(displacement.length);
  let kinetic = 0;
  let potential = 0;
  const cellArea = spacing * spacing;

  for (let index = 0; index < velocity.length; index += 1) {
    const kineticDensity = 0.5 * velocity[index] * velocity[index];
    kinetic += kineticDensity * cellArea;
    localDensity[index] += kineticDensity;
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = flattenIndex2D(x, y, size);

      if (geometry === 'torus-periodic' || x < size - 1) {
        const neighborX =
          geometry === 'torus-periodic' ? (x + 1) % size : x + 1;
        if (neighborX < size) {
          const rightIndex = flattenIndex2D(neighborX, y, size);
          const slopeX =
            (displacement[rightIndex] - displacement[index]) / spacing;
          const potentialDensityX =
            0.5 * waveSpeed * waveSpeed * slopeX * slopeX;
          potential += potentialDensityX * cellArea;
          localDensity[index] += 0.5 * potentialDensityX;
          localDensity[rightIndex] += 0.5 * potentialDensityX;
        }
      }

      if (geometry === 'torus-periodic' || y < size - 1) {
        const neighborY =
          geometry === 'torus-periodic' ? (y + 1) % size : y + 1;
        if (neighborY < size) {
          const downIndex = flattenIndex2D(x, neighborY, size);
          const slopeY =
            (displacement[downIndex] - displacement[index]) / spacing;
          const potentialDensityY =
            0.5 * waveSpeed * waveSpeed * slopeY * slopeY;
          potential += potentialDensityY * cellArea;
          localDensity[index] += 0.5 * potentialDensityY;
          localDensity[downIndex] += 0.5 * potentialDensityY;
        }
      }
    }
  }

  return {
    total: kinetic + potential,
    kinetic,
    potential,
    localDensity,
  };
}

function assertValidConfig(config: Classical2DConfig): void {
  assertSquareResolution(config.size);
  assertPositiveFinite(config.domainLength, 'domainLength');
  assertPositiveFinite(config.waveSpeed, 'waveSpeed');
  assertPositiveFinite(config.gaussianWidth, 'gaussianWidth');
  assertFiniteNumber(config.amplitude, 'amplitude');

  const validPresets =
    config.geometry === 'torus-periodic'
      ? CLASSICAL_2D_TORUS_PRESETS
      : CLASSICAL_2D_SQUARE_PRESETS;

  if (!validPresets.includes(config.initialPreset)) {
    throw new Error(
      `initialPreset '${String(config.initialPreset)}' is not valid for geometry ` +
        `'${config.geometry}'.`,
    );
  }
}
