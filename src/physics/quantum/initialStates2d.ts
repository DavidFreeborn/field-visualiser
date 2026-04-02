import { flattenIndex2D } from '../core/grids';
import { computeDiscreteNorm, type ComplexStateVector } from './initialStates';

export type Quantum2DInitialPreset =
  | 'site-localized'
  | 'gaussian-wavepacket'
  | 'selected-normal-mode'
  | 'split-superposition';

export interface Quantum2DStateOptions {
  readonly size: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly gaussianWidth: number;
  readonly momentumWidth: number;
  readonly modeNumberX: number;
  readonly modeNumberY: number;
}

export function createPeriodicQuantumInitialState2D(
  preset: Quantum2DInitialPreset,
  options: Quantum2DStateOptions,
): ComplexStateVector {
  switch (preset) {
    case 'site-localized':
      return normalize2DState(createSiteLocalizedState2D(options.size, options.centerX, options.centerY));
    case 'gaussian-wavepacket':
      return normalize2DState(
        createGaussianWavepacketState2D(
          options.size,
          options.centerX,
          options.centerY,
          options.gaussianWidth,
          options.modeNumberX,
          options.modeNumberY,
        ),
      );
    case 'selected-normal-mode':
      return createPeriodicNormalModeState2D(
        options.size,
        options.modeNumberX,
        options.modeNumberY,
      );
    case 'split-superposition':
      return normalize2DState(
        createSplitSuperpositionState2D(
          options.size,
          options.modeNumberX,
          options.modeNumberY,
          options.momentumWidth,
        ),
      );
  }
}

export function createFixedQuantumInitialState2D(
  preset: Quantum2DInitialPreset,
  options: Quantum2DStateOptions,
): ComplexStateVector {
  const interiorSize = options.size - 2;

  switch (preset) {
    case 'site-localized':
      return embedInteriorState(
        options.size,
        normalize2DState(
          createSiteLocalizedState2D(
            interiorSize,
            options.centerX,
            options.centerY,
          ),
        ),
      );
    case 'gaussian-wavepacket':
      return embedInteriorState(
        options.size,
        normalize2DState(
          createGaussianWavepacketState2D(
            interiorSize,
            options.centerX,
            options.centerY,
            options.gaussianWidth,
            options.modeNumberX,
            options.modeNumberY,
          ),
        ),
      );
    case 'selected-normal-mode':
    case 'split-superposition':
      return embedInteriorState(
        options.size,
        createFixedNormalModeState2D(
          interiorSize,
          options.modeNumberX,
          options.modeNumberY,
        ),
      );
  }
}

export function discreteFourierTransform2D(
  real: Float64Array,
  imaginary: Float64Array,
  size: number,
  outReal: Float64Array = new Float64Array(real.length),
  outImaginary: Float64Array = new Float64Array(real.length),
): ComplexStateVector {
  const normalization = 1 / size;

  for (let ky = 0; ky < size; ky += 1) {
    for (let kx = 0; kx < size; kx += 1) {
      let sumReal = 0;
      let sumImaginary = 0;

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const phase = (-2 * Math.PI * ((kx * x) + (ky * y))) / size;
          const cosPhase = Math.cos(phase);
          const sinPhase = Math.sin(phase);
          const index = flattenIndex2D(x, y, size);
          sumReal += real[index] * cosPhase - imaginary[index] * sinPhase;
          sumImaginary += real[index] * sinPhase + imaginary[index] * cosPhase;
        }
      }

      const modeIndex = flattenIndex2D(kx, ky, size);
      outReal[modeIndex] = normalization * sumReal;
      outImaginary[modeIndex] = normalization * sumImaginary;
    }
  }

  return { real: outReal, imaginary: outImaginary };
}

export function inverseDiscreteFourierTransform2D(
  real: Float64Array,
  imaginary: Float64Array,
  size: number,
  outReal: Float64Array = new Float64Array(real.length),
  outImaginary: Float64Array = new Float64Array(real.length),
): ComplexStateVector {
  const normalization = 1 / size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sumReal = 0;
      let sumImaginary = 0;

      for (let ky = 0; ky < size; ky += 1) {
        for (let kx = 0; kx < size; kx += 1) {
          const phase = (2 * Math.PI * ((kx * x) + (ky * y))) / size;
          const cosPhase = Math.cos(phase);
          const sinPhase = Math.sin(phase);
          const modeIndex = flattenIndex2D(kx, ky, size);
          sumReal += real[modeIndex] * cosPhase - imaginary[modeIndex] * sinPhase;
          sumImaginary += real[modeIndex] * sinPhase + imaginary[modeIndex] * cosPhase;
        }
      }

      const siteIndex = flattenIndex2D(x, y, size);
      outReal[siteIndex] = normalization * sumReal;
      outImaginary[siteIndex] = normalization * sumImaginary;
    }
  }

  return { real: outReal, imaginary: outImaginary };
}

export function sineTransform2D(
  real: Float64Array,
  imaginary: Float64Array,
  interiorSize: number,
  outReal: Float64Array = new Float64Array(real.length),
  outImaginary: Float64Array = new Float64Array(real.length),
): ComplexStateVector {
  const normalization = 2 / (interiorSize + 1);

  for (let my = 0; my < interiorSize; my += 1) {
    for (let mx = 0; mx < interiorSize; mx += 1) {
      let sumReal = 0;
      let sumImaginary = 0;

      for (let y = 0; y < interiorSize; y += 1) {
        const basisY = Math.sin((Math.PI * (my + 1) * (y + 1)) / (interiorSize + 1));
        for (let x = 0; x < interiorSize; x += 1) {
          const basisX = Math.sin((Math.PI * (mx + 1) * (x + 1)) / (interiorSize + 1));
          const basisValue = normalization * basisX * basisY;
          const index = flattenIndex2D(x, y, interiorSize);
          sumReal += basisValue * real[index];
          sumImaginary += basisValue * imaginary[index];
        }
      }

      const modeIndex = flattenIndex2D(mx, my, interiorSize);
      outReal[modeIndex] = sumReal;
      outImaginary[modeIndex] = sumImaginary;
    }
  }

  return { real: outReal, imaginary: outImaginary };
}

export function inverseSineTransform2D(
  real: Float64Array,
  imaginary: Float64Array,
  interiorSize: number,
  outReal: Float64Array = new Float64Array(real.length),
  outImaginary: Float64Array = new Float64Array(real.length),
): ComplexStateVector {
  const normalization = 2 / (interiorSize + 1);

  for (let y = 0; y < interiorSize; y += 1) {
    for (let x = 0; x < interiorSize; x += 1) {
      let sumReal = 0;
      let sumImaginary = 0;

      for (let my = 0; my < interiorSize; my += 1) {
        const basisY = Math.sin((Math.PI * (my + 1) * (y + 1)) / (interiorSize + 1));
        for (let mx = 0; mx < interiorSize; mx += 1) {
          const basisX = Math.sin((Math.PI * (mx + 1) * (x + 1)) / (interiorSize + 1));
          const basisValue = normalization * basisX * basisY;
          const modeIndex = flattenIndex2D(mx, my, interiorSize);
          sumReal += basisValue * real[modeIndex];
          sumImaginary += basisValue * imaginary[modeIndex];
        }
      }

      const siteIndex = flattenIndex2D(x, y, interiorSize);
      outReal[siteIndex] = sumReal;
      outImaginary[siteIndex] = sumImaginary;
    }
  }

  return { real: outReal, imaginary: outImaginary };
}

export function embedInteriorState(
  size: number,
  state: ComplexStateVector,
  outReal: Float64Array = new Float64Array(size * size),
  outImaginary: Float64Array = new Float64Array(size * size),
): ComplexStateVector {
  const interiorSize = size - 2;
  outReal.fill(0);
  outImaginary.fill(0);

  for (let y = 0; y < interiorSize; y += 1) {
    for (let x = 0; x < interiorSize; x += 1) {
      const interiorIndex = flattenIndex2D(x, y, interiorSize);
      const embeddedIndex = flattenIndex2D(x + 1, y + 1, size);
      outReal[embeddedIndex] = state.real[interiorIndex];
      outImaginary[embeddedIndex] = state.imaginary[interiorIndex];
    }
  }

  return {
    real: outReal,
    imaginary: outImaginary,
  };
}

export function extractInteriorState(
  size: number,
  real: Float64Array,
  imaginary: Float64Array,
  outReal: Float64Array = new Float64Array((size - 2) * (size - 2)),
  outImaginary: Float64Array = new Float64Array((size - 2) * (size - 2)),
): ComplexStateVector {
  const interiorSize = size - 2;

  for (let y = 0; y < interiorSize; y += 1) {
    for (let x = 0; x < interiorSize; x += 1) {
      const interiorIndex = flattenIndex2D(x, y, interiorSize);
      const embeddedIndex = flattenIndex2D(x + 1, y + 1, size);
      outReal[interiorIndex] = real[embeddedIndex];
      outImaginary[interiorIndex] = imaginary[embeddedIndex];
    }
  }

  return {
    real: outReal,
    imaginary: outImaginary,
  };
}

function createSiteLocalizedState2D(
  size: number,
  centerX: number,
  centerY: number,
): ComplexStateVector {
  const real = new Float64Array(size * size);
  const imaginary = new Float64Array(size * size);
  const x = Math.max(0, Math.min(size - 1, Math.round(centerX * (size - 1))));
  const y = Math.max(0, Math.min(size - 1, Math.round(centerY * (size - 1))));
  real[flattenIndex2D(x, y, size)] = 1;
  return { real, imaginary };
}

function createGaussianWavepacketState2D(
  size: number,
  centerX: number,
  centerY: number,
  width: number,
  modeNumberX: number,
  modeNumberY: number,
): ComplexStateVector {
  const real = new Float64Array(size * size);
  const imaginary = new Float64Array(size * size);

  for (let y = 0; y < size; y += 1) {
    const positionY = size > 1 ? y / (size - 1) : 0;
    const deltaY = shortestPeriodicDistance(positionY, centerY);
    for (let x = 0; x < size; x += 1) {
      const positionX = size > 1 ? x / (size - 1) : 0;
      const deltaX = shortestPeriodicDistance(positionX, centerX);
      const envelope = Math.exp(-0.5 * ((deltaX * deltaX + deltaY * deltaY) / (width * width)));
      const phase = (2 * Math.PI * ((modeNumberX * x) + (modeNumberY * y))) / Math.max(1, size);
      const index = flattenIndex2D(x, y, size);
      real[index] = envelope * Math.cos(phase);
      imaginary[index] = envelope * Math.sin(phase);
    }
  }

  return { real, imaginary };
}

function createPeriodicNormalModeState2D(
  size: number,
  modeNumberX: number,
  modeNumberY: number,
): ComplexStateVector {
  const real = new Float64Array(size * size);
  const imaginary = new Float64Array(size * size);
  const normalization = 1 / size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const phase = (2 * Math.PI * ((modeNumberX * x) + (modeNumberY * y))) / size;
      const index = flattenIndex2D(x, y, size);
      real[index] = normalization * Math.cos(phase);
      imaginary[index] = normalization * Math.sin(phase);
    }
  }

  return { real, imaginary };
}

function createFixedNormalModeState2D(
  interiorSize: number,
  modeNumberX: number,
  modeNumberY: number,
): ComplexStateVector {
  const modeReal = new Float64Array(interiorSize * interiorSize);
  const modeImaginary = new Float64Array(interiorSize * interiorSize);
  const clampedModeX = Math.max(1, Math.min(interiorSize, modeNumberX));
  const clampedModeY = Math.max(1, Math.min(interiorSize, modeNumberY));
  modeReal[flattenIndex2D(clampedModeX - 1, clampedModeY - 1, interiorSize)] = 1;
  return inverseSineTransform2D(modeReal, modeImaginary, interiorSize);
}

function createSplitSuperpositionState2D(
  size: number,
  modeNumberX: number,
  modeNumberY: number,
  momentumWidth: number,
): ComplexStateVector {
  const modeReal = new Float64Array(size * size);
  const modeImaginary = new Float64Array(size * size);
  const targetModeY = wrapModeIndex(modeNumberY, size);

  for (let ky = 0; ky < size; ky += 1) {
    const deltaY = wrapModeDistance(ky, targetModeY, size);
    for (let kx = 0; kx < size; kx += 1) {
      const deltaPositive = wrapModeDistance(kx, modeNumberX, size);
      const deltaNegative = wrapModeDistance(kx, -modeNumberX, size);
      const weight =
        Math.exp(
          -0.5 *
            ((deltaPositive * deltaPositive + deltaY * deltaY) /
              (momentumWidth * momentumWidth)),
        ) +
        Math.exp(
          -0.5 *
            ((deltaNegative * deltaNegative + deltaY * deltaY) /
              (momentumWidth * momentumWidth)),
        );
      modeReal[flattenIndex2D(kx, ky, size)] = weight;
    }
  }

  return inverseDiscreteFourierTransform2D(modeReal, modeImaginary, size);
}

function normalize2DState(state: ComplexStateVector): ComplexStateVector {
  const norm = Math.sqrt(computeDiscreteNorm(state.real, state.imaginary));

  if (norm === 0) {
    throw new Error('Cannot normalize the zero state.');
  }

  const real = state.real.slice();
  const imaginary = state.imaginary.slice();

  for (let index = 0; index < real.length; index += 1) {
    real[index] /= norm;
    imaginary[index] /= norm;
  }

  return { real, imaginary };
}

function shortestPeriodicDistance(position: number, center: number): number {
  const rawDelta = position - center;
  return rawDelta - Math.round(rawDelta);
}

function wrapModeDistance(modeIndex: number, centerMode: number, size: number): number {
  const rawDelta = modeIndex - centerMode;
  return rawDelta - Math.round(rawDelta / size) * size;
}

function wrapModeIndex(modeIndex: number, size: number): number {
  return ((modeIndex % size) + size) % size;
}
