import { fastForwardDftUnitary, fastInverseDftUnitary } from '../core/fft';

export interface GaussianBumpOptions {
  readonly amplitude: number;
  readonly center: number;
  readonly width: number;
}

/**
 * Presets valid on the periodic 1D lattice. 'gaussian-velocity' is the
 * strictly-positive bump whose positive spatial mean excites the periodic
 * zero mode (uniform drift); it is retained at engine level for zero-mode
 * physics tests but is no longer offered in the UI or accepted from shared
 * scenes - 'zero-mean-gaussian-velocity' is the user-facing choice.
 * 'travelling-gaussian-right' imposes the exact semi-discrete dispersion
 * relation v_k = -i sgn(k) omega_k u_k and only exists for periodic topology.
 * 'standing-modes' is a superposition of the cosine standing modes listed in
 * config.modeNumbers.
 */
export type Classical1DPeriodicInitialPreset =
  | 'gaussian-displacement'
  | 'gaussian-velocity'
  | 'zero-mean-gaussian-velocity'
  | 'travelling-gaussian-right'
  | 'single-site-displacement'
  | 'standing-modes';

/** Presets valid on the fixed (Dirichlet) interval. A globally one-way state
 * is incompatible with stationary zero endpoints, so there is no travelling
 * preset here, and mean subtraction has no zero mode to cancel. */
export type Classical1DFixedInitialPreset =
  | 'gaussian-displacement'
  | 'gaussian-velocity'
  | 'single-site-displacement'
  | 'standing-modes';

export type Classical1DInitialPreset =
  | Classical1DPeriodicInitialPreset
  | Classical1DFixedInitialPreset;

export const CLASSICAL_1D_PERIODIC_PRESETS: readonly Classical1DPeriodicInitialPreset[] =
  [
    'gaussian-displacement',
    'gaussian-velocity',
    'zero-mean-gaussian-velocity',
    'travelling-gaussian-right',
    'single-site-displacement',
    'standing-modes',
  ];

export const CLASSICAL_1D_FIXED_PRESETS: readonly Classical1DFixedInitialPreset[] =
  [
    'gaussian-displacement',
    'gaussian-velocity',
    'single-site-displacement',
    'standing-modes',
  ];

/**
 * Periodic Gaussian bump: sites sample x_j = j/N and the displacement from the
 * centre uses the shortest periodic distance, so packets wrap through the seam.
 */
export function createGaussianBump1D(
  siteCount: number,
  options: GaussianBumpOptions,
): Float64Array {
  const values = new Float64Array(siteCount);

  for (let index = 0; index < siteCount; index += 1) {
    const wrappedDistance = shortestPeriodicDistance(
      index / siteCount,
      options.center,
    );
    const scaledDistance = wrappedDistance / options.width;
    values[index] =
      options.amplitude * Math.exp(-0.5 * scaledDistance * scaledDistance);
  }

  return values;
}

/**
 * Fixed-interval Gaussian bump: the full grid includes both endpoints, sites
 * sample x_j = j/(N-1), and the distance is the ordinary non-wrapped one.
 */
export function createGaussianBumpFixed1D(
  siteCount: number,
  options: GaussianBumpOptions,
): Float64Array {
  const values = new Float64Array(siteCount);
  const denominator = siteCount - 1;

  for (let index = 0; index < siteCount; index += 1) {
    const delta = index / denominator - options.center;
    const scaledDistance = delta / options.width;
    values[index] =
      options.amplitude * Math.exp(-0.5 * scaledDistance * scaledDistance);
  }

  return values;
}

/** Subtracts the exact discrete mean in place so the periodic zero mode is
 * exactly unexcited. */
export function subtractDiscreteMean(values: Float64Array): Float64Array {
  let total = 0;
  for (const value of values) total += value;
  const mean = total / values.length;
  for (let index = 0; index < values.length; index += 1) values[index] -= mean;
  return values;
}

/**
 * Maps a normalized centre in [0, 1] to the nearest periodic site, wrapping
 * through the seam (centre 0.99 on a small ring maps to site 0 when nearest).
 */
export function mapPeriodicSiteIndex(
  center: number,
  siteCount: number,
): number {
  return ((Math.round(center * siteCount) % siteCount) + siteCount) % siteCount;
}

/**
 * Superposition of periodic cosine standing modes, each with amplitude
 * `amplitude`: u_j = A sum_{n in modes} cos(2 pi n j / N).
 */
export function createStandingModes1D(
  siteCount: number,
  modeNumbers: readonly number[],
  amplitude: number,
): Float64Array {
  const values = new Float64Array(siteCount);

  for (const modeNumber of modeNumbers) {
    for (let index = 0; index < siteCount; index += 1) {
      values[index] +=
        amplitude * Math.cos((2 * Math.PI * modeNumber * index) / siteCount);
    }
  }

  return values;
}

/**
 * Superposition of Dirichlet sine standing modes, each with amplitude
 * `amplitude`: u_j = A sum_{n in modes} sin(pi n j / (N-1)); endpoints zero.
 */
export function createStandingModesDirichlet1D(
  siteCount: number,
  modeNumbers: readonly number[],
  amplitude: number,
): Float64Array {
  const values = new Float64Array(siteCount);
  const denominator = siteCount - 1;

  for (const modeNumber of modeNumbers) {
    for (let index = 1; index < siteCount - 1; index += 1) {
      values[index] +=
        amplitude * Math.sin((Math.PI * modeNumber * index) / denominator);
    }
  }

  return values;
}

export interface TravellingPacketState {
  readonly displacement: Float64Array;
  readonly velocity: Float64Array;
}

/**
 * Exact right-moving packet on the periodic lattice.
 *
 * The displacement bump is transformed to lattice Fourier modes and the
 * velocity is fixed by the exact semi-discrete relation
 * v_k = -i sgn(k) omega_k u_k with omega_k = (2c/h)|sin(pi k / N)|.
 * The zero mode has no direction (omega_0 = 0) and, for an even lattice, the
 * self-conjugate Nyquist mode has no distinct sign of k, so its displacement
 * component is removed before the directional construction.
 */
export function createTravellingGaussianRight1D(
  siteCount: number,
  options: GaussianBumpOptions,
  spacing: number,
  waveSpeed: number,
): TravellingPacketState {
  const bump = createGaussianBump1D(siteCount, options);
  const zeroImaginary = new Float64Array(siteCount);
  const modeReal = new Float64Array(siteCount);
  const modeImaginary = new Float64Array(siteCount);
  fastForwardDftUnitary(bump, zeroImaginary, modeReal, modeImaginary);

  if (siteCount % 2 === 0) {
    modeReal[siteCount / 2] = 0;
    modeImaginary[siteCount / 2] = 0;
  }

  const velocityModeReal = new Float64Array(siteCount);
  const velocityModeImaginary = new Float64Array(siteCount);

  for (let mode = 1; mode < siteCount; mode += 1) {
    const omega =
      (2 * waveSpeed * Math.abs(Math.sin((Math.PI * mode) / siteCount))) /
      spacing;
    const sign = mode < siteCount / 2 ? 1 : -1;
    // -i * sign * omega * (a + ib) = sign * omega * (b - ia)
    velocityModeReal[mode] = sign * omega * modeImaginary[mode];
    velocityModeImaginary[mode] = -sign * omega * modeReal[mode];
  }

  const displacement = new Float64Array(siteCount);
  const displacementImaginary = new Float64Array(siteCount);
  fastInverseDftUnitary(
    modeReal,
    modeImaginary,
    displacement,
    displacementImaginary,
  );

  const velocity = new Float64Array(siteCount);
  const velocityImaginary = new Float64Array(siteCount);
  fastInverseDftUnitary(
    velocityModeReal,
    velocityModeImaginary,
    velocity,
    velocityImaginary,
  );

  return { displacement, velocity };
}

function shortestPeriodicDistance(position: number, center: number): number {
  const rawDelta = position - center;

  return rawDelta - Math.round(rawDelta);
}
