export interface GaussianBumpOptions {
  readonly amplitude: number;
  readonly center: number;
  readonly width: number;
}

export type Classical1DInitialPreset =
  | 'gaussian-displacement'
  | 'gaussian-velocity'
  | 'single-site-displacement'
  | 'standing-mode-1'
  | 'standing-mode-2';

export function createGaussianBump1D(
  siteCount: number,
  options: GaussianBumpOptions,
): Float64Array {
  const values = new Float64Array(siteCount);

  for (let index = 0; index < siteCount; index += 1) {
    const wrappedDistance = shortestPeriodicDistance(index / siteCount, options.center);
    const scaledDistance = wrappedDistance / options.width;
    values[index] = options.amplitude * Math.exp(-0.5 * scaledDistance * scaledDistance);
  }

  return values;
}

export function createStandingMode1D(
  siteCount: number,
  modeNumber: number,
  amplitude: number,
): Float64Array {
  const values = new Float64Array(siteCount);

  for (let index = 0; index < siteCount; index += 1) {
    values[index] =
      amplitude * Math.cos((2 * Math.PI * modeNumber * index) / siteCount);
  }

  return values;
}

export function createStandingModeDirichlet1D(
  siteCount: number,
  modeNumber: number,
  amplitude: number,
): Float64Array {
  const values = new Float64Array(siteCount);
  const denominator = siteCount - 1;

  for (let index = 1; index < siteCount - 1; index += 1) {
    values[index] = amplitude * Math.sin((Math.PI * modeNumber * index) / denominator);
  }

  return values;
}

function shortestPeriodicDistance(position: number, center: number): number {
  const rawDelta = position - center;

  return rawDelta - Math.round(rawDelta);
}
