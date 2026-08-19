import { fastInverseDftUnitary2D } from '../core/fft';
import { flattenIndex2D } from '../core/grids';
import { assertIntegerInRange } from '../core/validation';
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
      return normalize2DState(
        createPeriodicSiteLocalizedState2D(
          options.size,
          options.centerX,
          options.centerY,
        ),
      );
    case 'gaussian-wavepacket':
      return normalize2DState(
        createPeriodicGaussianWavepacketState2D(
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
      assertDistinctSplitModeX(options.modeNumberX, options.size);
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
          createFixedSiteLocalizedInteriorState2D(
            options.size,
            options.centerX,
            options.centerY,
          ),
        ),
      );
    case 'gaussian-wavepacket':
      return embedInteriorState(
        options.size,
        normalize2DState(
          createFixedGaussianInteriorState2D(
            options.size,
            options.centerX,
            options.centerY,
            options.gaussianWidth,
            options.modeNumberX,
            options.modeNumberY,
          ),
        ),
      );
    case 'selected-normal-mode':
      return embedInteriorState(
        options.size,
        createFixedNormalModeState2D(
          interiorSize,
          options.modeNumberX,
          options.modeNumberY,
        ),
      );
    case 'split-superposition':
      // A +kx / -kx split needs periodic topology; on a Dirichlet square it
      // would silently collapse into a single standing mode, so it is
      // rejected here and sanitized out of shared scenes upstream.
      throw new Error(
        'split-superposition is not available on the fixed square: it requires periodic topology.',
      );
  }
}

/**
 * The +kx and -kx branches of a split superposition must be distinct: kx = 0
 * is its own mirror and, on an even lattice, so is the Nyquist mode kx = N/2.
 * ky = 0 is deliberately allowed - it is often the cleanest genuinely
 * opposite split.
 */
export function assertDistinctSplitModeX(
  modeNumberX: number,
  size: number,
): void {
  const wrapped = ((modeNumberX % size) + size) % size;

  if (wrapped === 0) {
    throw new Error(
      'split-superposition requires modeNumberX != 0: mode 0 has no distinct opposite.',
    );
  }

  if (size % 2 === 0 && wrapped === size / 2) {
    throw new Error(
      'split-superposition rejects the Nyquist mode on an even lattice: it is self-conjugate and has no distinct opposite.',
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
  const basis = getPeriodicBasisCache(size);
  const rowReal = new Float64Array(real.length);
  const rowImaginary = new Float64Array(real.length);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * size;
    for (let kx = 0; kx < size; kx += 1) {
      let sumReal = 0;
      let sumImaginary = 0;
      const basisOffset = kx * size;

      for (let x = 0; x < size; x += 1) {
        const index = rowOffset + x;
        const cosPhase = basis.cos[basisOffset + x];
        const sinPhase = basis.sin[basisOffset + x];
        sumReal += real[index] * cosPhase + imaginary[index] * sinPhase;
        sumImaginary += -real[index] * sinPhase + imaginary[index] * cosPhase;
      }

      rowReal[rowOffset + kx] = basis.normalization * sumReal;
      rowImaginary[rowOffset + kx] = basis.normalization * sumImaginary;
    }
  }

  for (let kx = 0; kx < size; kx += 1) {
    for (let ky = 0; ky < size; ky += 1) {
      let sumReal = 0;
      let sumImaginary = 0;
      const basisOffset = ky * size;

      for (let y = 0; y < size; y += 1) {
        const index = y * size + kx;
        const cosPhase = basis.cos[basisOffset + y];
        const sinPhase = basis.sin[basisOffset + y];
        sumReal += rowReal[index] * cosPhase + rowImaginary[index] * sinPhase;
        sumImaginary +=
          -rowReal[index] * sinPhase + rowImaginary[index] * cosPhase;
      }

      const modeIndex = flattenIndex2D(kx, ky, size);
      outReal[modeIndex] = basis.normalization * sumReal;
      outImaginary[modeIndex] = basis.normalization * sumImaginary;
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
  const basis = getPeriodicBasisCache(size);
  const columnReal = new Float64Array(real.length);
  const columnImaginary = new Float64Array(real.length);

  for (let kx = 0; kx < size; kx += 1) {
    for (let y = 0; y < size; y += 1) {
      let sumReal = 0;
      let sumImaginary = 0;
      const basisOffset = y * size;

      for (let ky = 0; ky < size; ky += 1) {
        const index = flattenIndex2D(kx, ky, size);
        const cosPhase = basis.cos[basisOffset + ky];
        const sinPhase = basis.sin[basisOffset + ky];
        sumReal += real[index] * cosPhase - imaginary[index] * sinPhase;
        sumImaginary += real[index] * sinPhase + imaginary[index] * cosPhase;
      }

      const siteIndex = y * size + kx;
      columnReal[siteIndex] = basis.normalization * sumReal;
      columnImaginary[siteIndex] = basis.normalization * sumImaginary;
    }
  }

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * size;
    for (let x = 0; x < size; x += 1) {
      let sumReal = 0;
      let sumImaginary = 0;
      const basisOffset = x * size;

      for (let kx = 0; kx < size; kx += 1) {
        const index = rowOffset + kx;
        const cosPhase = basis.cos[basisOffset + kx];
        const sinPhase = basis.sin[basisOffset + kx];
        sumReal +=
          columnReal[index] * cosPhase - columnImaginary[index] * sinPhase;
        sumImaginary +=
          columnReal[index] * sinPhase + columnImaginary[index] * cosPhase;
      }

      const siteIndex = rowOffset + x;
      outReal[siteIndex] = basis.normalization * sumReal;
      outImaginary[siteIndex] = basis.normalization * sumImaginary;
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
  const basis = getSineBasisCache(interiorSize);
  const rowReal = new Float64Array(real.length);
  const rowImaginary = new Float64Array(real.length);

  for (let y = 0; y < interiorSize; y += 1) {
    const rowOffset = y * interiorSize;
    for (let mx = 0; mx < interiorSize; mx += 1) {
      let sumReal = 0;
      let sumImaginary = 0;
      const basisOffset = mx * interiorSize;

      for (let x = 0; x < interiorSize; x += 1) {
        const basisValue = basis.values[basisOffset + x];
        sumReal += basisValue * real[rowOffset + x];
        sumImaginary += basisValue * imaginary[rowOffset + x];
      }

      rowReal[rowOffset + mx] = basis.normalization * sumReal;
      rowImaginary[rowOffset + mx] = basis.normalization * sumImaginary;
    }
  }

  for (let mx = 0; mx < interiorSize; mx += 1) {
    for (let my = 0; my < interiorSize; my += 1) {
      let sumReal = 0;
      let sumImaginary = 0;
      const basisOffset = my * interiorSize;

      for (let y = 0; y < interiorSize; y += 1) {
        const basisValue = basis.values[basisOffset + y];
        const index = y * interiorSize + mx;
        sumReal += basisValue * rowReal[index];
        sumImaginary += basisValue * rowImaginary[index];
      }

      const modeIndex = flattenIndex2D(mx, my, interiorSize);
      outReal[modeIndex] = basis.normalization * sumReal;
      outImaginary[modeIndex] = basis.normalization * sumImaginary;
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
  const basis = getSineBasisCache(interiorSize);
  const columnReal = new Float64Array(real.length);
  const columnImaginary = new Float64Array(real.length);

  for (let mx = 0; mx < interiorSize; mx += 1) {
    for (let y = 0; y < interiorSize; y += 1) {
      let sumReal = 0;
      let sumImaginary = 0;
      const basisOffset = y * interiorSize;

      for (let my = 0; my < interiorSize; my += 1) {
        const basisValue = basis.values[basisOffset + my];
        const modeIndex = flattenIndex2D(mx, my, interiorSize);
        sumReal += basisValue * real[modeIndex];
        sumImaginary += basisValue * imaginary[modeIndex];
      }

      const siteIndex = y * interiorSize + mx;
      columnReal[siteIndex] = basis.normalization * sumReal;
      columnImaginary[siteIndex] = basis.normalization * sumImaginary;
    }
  }

  for (let y = 0; y < interiorSize; y += 1) {
    const rowOffset = y * interiorSize;
    for (let x = 0; x < interiorSize; x += 1) {
      let sumReal = 0;
      let sumImaginary = 0;
      const basisOffset = x * interiorSize;

      for (let mx = 0; mx < interiorSize; mx += 1) {
        const basisValue = basis.values[basisOffset + mx];
        const index = rowOffset + mx;
        sumReal += basisValue * columnReal[index];
        sumImaginary += basisValue * columnImaginary[index];
      }

      const siteIndex = rowOffset + x;
      outReal[siteIndex] = basis.normalization * sumReal;
      outImaginary[siteIndex] = basis.normalization * sumImaginary;
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

function createPeriodicSiteLocalizedState2D(
  size: number,
  centerX: number,
  centerY: number,
): ComplexStateVector {
  const real = new Float64Array(size * size);
  const imaginary = new Float64Array(size * size);
  // Periodic seam mapping per axis: a centre near 0.99 wraps to index zero.
  const x = ((Math.round(centerX * size) % size) + size) % size;
  const y = ((Math.round(centerY * size) % size) + size) % size;
  real[flattenIndex2D(x, y, size)] = 1;
  return { real, imaginary };
}

function createFixedSiteLocalizedInteriorState2D(
  size: number,
  centerX: number,
  centerY: number,
): ComplexStateVector {
  const interiorSize = size - 2;
  const real = new Float64Array(interiorSize * interiorSize);
  const imaginary = new Float64Array(interiorSize * interiorSize);
  // Full physical coordinate grid x_j = j/(size-1); the nearest site is
  // clamped into the interior because the boundary is pinned to zero.
  const fullX = Math.max(
    1,
    Math.min(size - 2, Math.round(centerX * (size - 1))),
  );
  const fullY = Math.max(
    1,
    Math.min(size - 2, Math.round(centerY * (size - 1))),
  );
  real[flattenIndex2D(fullX - 1, fullY - 1, interiorSize)] = 1;
  return { real, imaginary };
}

function createPeriodicGaussianWavepacketState2D(
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
    const deltaY = shortestPeriodicDistance(y / size, centerY);
    for (let x = 0; x < size; x += 1) {
      const deltaX = shortestPeriodicDistance(x / size, centerX);
      const envelope = Math.exp(
        -0.5 * ((deltaX * deltaX + deltaY * deltaY) / (width * width)),
      );
      // Periodic carrier convention e^{2 pi i (n_x x + n_y y) / L}.
      const phase = (2 * Math.PI * (modeNumberX * x + modeNumberY * y)) / size;
      const index = flattenIndex2D(x, y, size);
      real[index] = envelope * Math.cos(phase);
      imaginary[index] = envelope * Math.sin(phase);
    }
  }

  return { real, imaginary };
}

function createFixedGaussianInteriorState2D(
  size: number,
  centerX: number,
  centerY: number,
  width: number,
  modeNumberX: number,
  modeNumberY: number,
): ComplexStateVector {
  const interiorSize = size - 2;
  const real = new Float64Array(interiorSize * interiorSize);
  const imaginary = new Float64Array(interiorSize * interiorSize);
  const denominator = size - 1;

  for (let y = 0; y < interiorSize; y += 1) {
    const positionY = (y + 1) / denominator;
    const deltaY = positionY - centerY;
    for (let x = 0; x < interiorSize; x += 1) {
      const positionX = (x + 1) / denominator;
      const deltaX = positionX - centerX;
      const envelope = Math.exp(
        -0.5 * ((deltaX * deltaX + deltaY * deltaY) / (width * width)),
      );
      // Dirichlet carrier convention e^{pi i (n_x x + n_y y) / L}, consistent
      // with the sine modes (NOT the periodic 2 pi convention).
      const phase =
        Math.PI * (modeNumberX * positionX + modeNumberY * positionY);
      const index = flattenIndex2D(x, y, interiorSize);
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
      const phase = (2 * Math.PI * (modeNumberX * x + modeNumberY * y)) / size;
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
  assertIntegerInRange(modeNumberX, 'modeNumberX', 1, interiorSize);
  assertIntegerInRange(modeNumberY, 'modeNumberY', 1, interiorSize);

  // Built analytically as the product of normalized sine factors in O(N^2);
  // a dense inverse sine transform here would cost O(N^3) per reset.
  const real = new Float64Array(interiorSize * interiorSize);
  const imaginary = new Float64Array(interiorSize * interiorSize);
  const normalization = 2 / (interiorSize + 1);

  for (let y = 0; y < interiorSize; y += 1) {
    const sineY = Math.sin(
      (Math.PI * modeNumberY * (y + 1)) / (interiorSize + 1),
    );
    for (let x = 0; x < interiorSize; x += 1) {
      const sineX = Math.sin(
        (Math.PI * modeNumberX * (x + 1)) / (interiorSize + 1),
      );
      real[flattenIndex2D(x, y, interiorSize)] = normalization * sineX * sineY;
    }
  }

  return { real, imaginary };
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

  // Fast unitary 2D inverse FFT; the dense separable transform below is kept
  // only as a reference implementation for equivalence tests.
  const real = new Float64Array(size * size);
  const imaginary = new Float64Array(size * size);
  fastInverseDftUnitary2D(modeReal, modeImaginary, size, real, imaginary);
  return { real, imaginary };
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

const periodicBasisCache = new Map<
  number,
  { cos: Float64Array; sin: Float64Array; normalization: number }
>();
const sineBasisCache = new Map<
  number,
  { values: Float64Array; normalization: number }
>();

function getPeriodicBasisCache(size: number): {
  cos: Float64Array;
  sin: Float64Array;
  normalization: number;
} {
  const cached = periodicBasisCache.get(size);

  if (cached !== undefined) {
    return cached;
  }

  const cos = new Float64Array(size * size);
  const sin = new Float64Array(size * size);
  const normalization = 1 / Math.sqrt(size);

  for (let mode = 0; mode < size; mode += 1) {
    const modeOffset = mode * size;
    for (let sample = 0; sample < size; sample += 1) {
      const phase = (2 * Math.PI * mode * sample) / size;
      cos[modeOffset + sample] = Math.cos(phase);
      sin[modeOffset + sample] = Math.sin(phase);
    }
  }

  const basis = { cos, sin, normalization };
  periodicBasisCache.set(size, basis);
  return basis;
}

function getSineBasisCache(interiorSize: number): {
  values: Float64Array;
  normalization: number;
} {
  const cached = sineBasisCache.get(interiorSize);

  if (cached !== undefined) {
    return cached;
  }

  const values = new Float64Array(interiorSize * interiorSize);
  const normalization = Math.sqrt(2 / (interiorSize + 1));

  for (let mode = 0; mode < interiorSize; mode += 1) {
    const modeOffset = mode * interiorSize;
    for (let sample = 0; sample < interiorSize; sample += 1) {
      values[modeOffset + sample] = Math.sin(
        (Math.PI * (mode + 1) * (sample + 1)) / (interiorSize + 1),
      );
    }
  }

  const basis = { values, normalization };
  sineBasisCache.set(interiorSize, basis);
  return basis;
}

function shortestPeriodicDistance(position: number, center: number): number {
  const rawDelta = position - center;
  return rawDelta - Math.round(rawDelta);
}

function wrapModeDistance(
  modeIndex: number,
  centerMode: number,
  size: number,
): number {
  const rawDelta = modeIndex - centerMode;
  return rawDelta - Math.round(rawDelta / size) * size;
}

function wrapModeIndex(modeIndex: number, size: number): number {
  return ((modeIndex % size) + size) % size;
}
