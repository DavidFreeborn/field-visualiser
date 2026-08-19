/**
 * Fast unitary transforms used by the quantum engines.
 *
 * Conventions match the dense reference transforms in
 * `src/physics/quantum/initialStates.ts` exactly:
 *
 * - Forward DFT:  X_k = (1/sqrt(N)) * sum_n x_n exp(-2*pi*i*k*n/N)
 * - Inverse DFT:  x_n = (1/sqrt(N)) * sum_k X_k exp(+2*pi*i*k*n/N)
 * - DST-I:        S_m = sqrt(2/(N+1)) * sum_j x_j sin(pi*(m+1)*(j+1)/(N+1))
 *                 (orthonormal, so the transform is its own inverse)
 *
 * Power-of-two lengths use an iterative radix-2 FFT. All other lengths use
 * Bluestein's chirp-z algorithm, which reduces an arbitrary-length DFT to a
 * power-of-two convolution, so every lattice size exposed by the UI or by
 * `scene=` URLs is handled with O(N log N) complexity.
 *
 * Plans (twiddle tables, chirp tables, and scratch buffers) are cached per
 * length, so steady-state playback performs no typed-array allocation.
 */

interface Pow2Tables {
  readonly bitReversal: Uint32Array;
  readonly cos: Float64Array;
  readonly sin: Float64Array;
}

const pow2TableCache = new Map<number, Pow2Tables>();

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result *= 2;
  }
  return result;
}

function getPow2Tables(size: number): Pow2Tables {
  const cached = pow2TableCache.get(size);
  if (cached !== undefined) {
    return cached;
  }

  const bitReversal = new Uint32Array(size);
  let bits = 0;
  while (1 << bits < size) {
    bits += 1;
  }
  for (let index = 0; index < size; index += 1) {
    let reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      reversed = (reversed << 1) | ((index >>> bit) & 1);
    }
    bitReversal[index] = reversed;
  }

  const half = size / 2;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let index = 0; index < half; index += 1) {
    const angle = (2 * Math.PI * index) / size;
    cos[index] = Math.cos(angle);
    sin[index] = Math.sin(angle);
  }

  const tables = { bitReversal, cos, sin };
  pow2TableCache.set(size, tables);
  return tables;
}

/**
 * In-place unnormalized radix-2 FFT. `sign` is -1 for the forward kernel
 * exp(-2*pi*i*k*n/N) and +1 for the inverse kernel.
 */
function fftPow2InPlace(real: Float64Array, imag: Float64Array, size: number, sign: -1 | 1): void {
  const tables = getPow2Tables(size);
  const bitReversal = tables.bitReversal;

  for (let index = 0; index < size; index += 1) {
    const swapIndex = bitReversal[index];
    if (swapIndex > index) {
      const tempReal = real[index];
      real[index] = real[swapIndex];
      real[swapIndex] = tempReal;
      const tempImag = imag[index];
      imag[index] = imag[swapIndex];
      imag[swapIndex] = tempImag;
    }
  }

  for (let blockSize = 2; blockSize <= size; blockSize *= 2) {
    const halfBlock = blockSize / 2;
    const twiddleStride = size / blockSize;

    for (let blockStart = 0; blockStart < size; blockStart += blockSize) {
      for (let pair = 0; pair < halfBlock; pair += 1) {
        const twiddleIndex = pair * twiddleStride;
        const twiddleReal = tables.cos[twiddleIndex];
        const twiddleImag = sign * tables.sin[twiddleIndex];
        const evenIndex = blockStart + pair;
        const oddIndex = evenIndex + halfBlock;

        const oddReal = real[oddIndex] * twiddleReal - imag[oddIndex] * twiddleImag;
        const oddImag = real[oddIndex] * twiddleImag + imag[oddIndex] * twiddleReal;

        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;
      }
    }
  }
}

interface BluesteinPlan {
  readonly size: number;
  readonly convolutionSize: number;
  /** cos/sin of pi * (n^2 mod 2N) / N, i.e. the chirp angle. */
  readonly chirpCos: Float64Array;
  readonly chirpSin: Float64Array;
  /** FFT of the chirp filter b_m = exp(+i * pi * m^2 / N). */
  readonly filterFftReal: Float64Array;
  readonly filterFftImag: Float64Array;
  readonly scratchReal: Float64Array;
  readonly scratchImag: Float64Array;
}

const bluesteinPlanCache = new Map<number, BluesteinPlan>();

function getBluesteinPlan(size: number): BluesteinPlan {
  const cached = bluesteinPlanCache.get(size);
  if (cached !== undefined) {
    return cached;
  }

  const convolutionSize = nextPowerOfTwo(2 * size - 1);
  const chirpCos = new Float64Array(size);
  const chirpSin = new Float64Array(size);

  for (let index = 0; index < size; index += 1) {
    // n^2 mod 2N keeps the chirp angle small for large n (numerical accuracy).
    const squareMod = (index * index) % (2 * size);
    const angle = (Math.PI * squareMod) / size;
    chirpCos[index] = Math.cos(angle);
    chirpSin[index] = Math.sin(angle);
  }

  const filterFftReal = new Float64Array(convolutionSize);
  const filterFftImag = new Float64Array(convolutionSize);
  filterFftReal[0] = 1;
  for (let index = 1; index < size; index += 1) {
    filterFftReal[index] = chirpCos[index];
    filterFftImag[index] = chirpSin[index];
    filterFftReal[convolutionSize - index] = chirpCos[index];
    filterFftImag[convolutionSize - index] = chirpSin[index];
  }
  fftPow2InPlace(filterFftReal, filterFftImag, convolutionSize, -1);

  const plan: BluesteinPlan = {
    size,
    convolutionSize,
    chirpCos,
    chirpSin,
    filterFftReal,
    filterFftImag,
    scratchReal: new Float64Array(convolutionSize),
    scratchImag: new Float64Array(convolutionSize),
  };
  bluesteinPlanCache.set(size, plan);
  return plan;
}

/**
 * Crossovers measured on the benchmark suite: below these sizes a cached
 * dense matrix-vector product beats Bluestein's constant factors (three
 * power-of-two FFTs of ~4N points plus chirp multiplies), while radix-2
 * power-of-two sizes always use the FFT.
 */
const DFT_DENSE_CROSSOVER = 32;
const DST_DENSE_CROSSOVER = 96;

interface DenseDftTables {
  readonly cos: Float64Array;
  readonly sin: Float64Array;
}

const denseDftTableCache = new Map<number, DenseDftTables>();

function getDenseDftTables(size: number): DenseDftTables {
  const cached = denseDftTableCache.get(size);
  if (cached !== undefined) {
    return cached;
  }

  const cos = new Float64Array(size * size);
  const sin = new Float64Array(size * size);
  for (let mode = 0; mode < size; mode += 1) {
    for (let sample = 0; sample < size; sample += 1) {
      const angle = (2 * Math.PI * mode * sample) / size;
      cos[mode * size + sample] = Math.cos(angle);
      sin[mode * size + sample] = Math.sin(angle);
    }
  }

  const tables = { cos, sin };
  denseDftTableCache.set(size, tables);
  return tables;
}

const denseScratchCache = new Map<number, { real: Float64Array; imag: Float64Array }>();

function getDenseScratch(size: number): { real: Float64Array; imag: Float64Array } {
  const cached = denseScratchCache.get(size);
  if (cached !== undefined) {
    return cached;
  }
  const scratch = { real: new Float64Array(size), imag: new Float64Array(size) };
  denseScratchCache.set(size, scratch);
  return scratch;
}

function denseDftUnnormalized(
  real: Float64Array,
  imag: Float64Array,
  outReal: Float64Array,
  outImag: Float64Array,
  sign: -1 | 1,
): void {
  const size = real.length;
  const tables = getDenseDftTables(size);
  const scratch = getDenseScratch(size);
  scratch.real.set(real);
  scratch.imag.set(imag);

  for (let mode = 0; mode < size; mode += 1) {
    const offset = mode * size;
    let sumReal = 0;
    let sumImag = 0;
    for (let sample = 0; sample < size; sample += 1) {
      const cos = tables.cos[offset + sample];
      const sin = sign * tables.sin[offset + sample];
      sumReal += scratch.real[sample] * cos - scratch.imag[sample] * sin;
      sumImag += scratch.real[sample] * sin + scratch.imag[sample] * cos;
    }
    outReal[mode] = sumReal;
    outImag[mode] = sumImag;
  }
}

/**
 * Unnormalized forward DFT (kernel exp(-2*pi*i*k*n/N)) for arbitrary length,
 * writing into `outReal`/`outImag`. Safe to call with out === in.
 */
function dftUnnormalized(
  real: Float64Array,
  imag: Float64Array,
  outReal: Float64Array,
  outImag: Float64Array,
  sign: -1 | 1,
): void {
  const size = real.length;

  if (!isPowerOfTwo(size) && size < DFT_DENSE_CROSSOVER) {
    denseDftUnnormalized(real, imag, outReal, outImag, sign);
    return;
  }

  if (isPowerOfTwo(size)) {
    if (outReal !== real) {
      outReal.set(real);
      outImag.set(imag);
    }
    fftPow2InPlace(outReal, outImag, size, sign);
    return;
  }

  const plan = getBluesteinPlan(size);
  const { convolutionSize, chirpCos, chirpSin, scratchReal, scratchImag } = plan;

  // a_n = x_n * exp(sign * i * pi * n^2 / N)
  for (let index = 0; index < size; index += 1) {
    const chirpReal = chirpCos[index];
    const chirpImag = sign * chirpSin[index];
    scratchReal[index] = real[index] * chirpReal - imag[index] * chirpImag;
    scratchImag[index] = real[index] * chirpImag + imag[index] * chirpReal;
  }
  scratchReal.fill(0, size);
  scratchImag.fill(0, size);

  fftPow2InPlace(scratchReal, scratchImag, convolutionSize, -1);

  // Multiply by the FFT of the chirp filter. For sign = +1 the filter is the
  // conjugate of the precomputed (sign = -1) filter, and because the filter
  // sequence b_m is symmetric and real-FFT-conjugation identities hold, the
  // conjugate filter's FFT equals the conjugate of the stored FFT.
  const filterReal = plan.filterFftReal;
  const filterImag = plan.filterFftImag;
  if (sign === -1) {
    for (let index = 0; index < convolutionSize; index += 1) {
      const productReal =
        scratchReal[index] * filterReal[index] - scratchImag[index] * filterImag[index];
      const productImag =
        scratchReal[index] * filterImag[index] + scratchImag[index] * filterReal[index];
      scratchReal[index] = productReal;
      scratchImag[index] = productImag;
    }
  } else {
    for (let index = 0; index < convolutionSize; index += 1) {
      const productReal =
        scratchReal[index] * filterReal[index] + scratchImag[index] * filterImag[index];
      const productImag =
        -scratchReal[index] * filterImag[index] + scratchImag[index] * filterReal[index];
      scratchReal[index] = productReal;
      scratchImag[index] = productImag;
    }
  }

  // Inverse FFT via conjugation: ifft(z) = conj(fft(conj(z))) / M.
  for (let index = 0; index < convolutionSize; index += 1) {
    scratchImag[index] = -scratchImag[index];
  }
  fftPow2InPlace(scratchReal, scratchImag, convolutionSize, -1);
  const inverseScale = 1 / convolutionSize;

  // X_k = exp(sign * i * pi * k^2 / N) * c_k
  for (let index = 0; index < size; index += 1) {
    const convReal = scratchReal[index] * inverseScale;
    const convImag = -scratchImag[index] * inverseScale;
    const chirpReal = chirpCos[index];
    const chirpImag = sign * chirpSin[index];
    outReal[index] = convReal * chirpReal - convImag * chirpImag;
    outImag[index] = convReal * chirpImag + convImag * chirpReal;
  }
}

/** Unitary forward DFT matching `discreteFourierTransform`. In-place safe. */
export function fastForwardDftUnitary(
  real: Float64Array,
  imag: Float64Array,
  outReal: Float64Array,
  outImag: Float64Array,
): void {
  const size = real.length;
  dftUnnormalized(real, imag, outReal, outImag, -1);
  const scale = 1 / Math.sqrt(size);
  for (let index = 0; index < size; index += 1) {
    outReal[index] *= scale;
    outImag[index] *= scale;
  }
}

/** Unitary inverse DFT matching `inverseDiscreteFourierTransform`. In-place safe. */
export function fastInverseDftUnitary(
  real: Float64Array,
  imag: Float64Array,
  outReal: Float64Array,
  outImag: Float64Array,
): void {
  const size = real.length;
  dftUnnormalized(real, imag, outReal, outImag, 1);
  const scale = 1 / Math.sqrt(size);
  for (let index = 0; index < size; index += 1) {
    outReal[index] *= scale;
    outImag[index] *= scale;
  }
}

interface Dst1Plan {
  readonly size: number;
  readonly extendedSize: number;
  readonly normalization: number;
  readonly scratchReal: Float64Array;
  readonly scratchImag: Float64Array;
}

const dst1PlanCache = new Map<number, Dst1Plan>();

function getDst1Plan(size: number): Dst1Plan {
  const cached = dst1PlanCache.get(size);
  if (cached !== undefined) {
    return cached;
  }

  const extendedSize = 2 * (size + 1);
  const plan: Dst1Plan = {
    size,
    extendedSize,
    normalization: Math.sqrt(2 / (size + 1)),
    scratchReal: new Float64Array(extendedSize),
    scratchImag: new Float64Array(extendedSize),
  };
  dst1PlanCache.set(size, plan);
  return plan;
}

/**
 * Orthonormal DST-I for a complex sequence, matching the dense
 * `sineTransform`/`inverseSineTransform` pair (which are identical because the
 * orthonormal DST-I is involutory). Computed via the odd extension of length
 * 2(N+1) and a single complex FFT:
 *
 *   Y_m = FFT(odd extension)_m = -2i * sum_j x_j sin(pi*m*(j+1)/(N+1))
 *   =>  S_m = (i/2) * Y_m
 *
 * In-place safe (out may alias in).
 */
export function fastDst1Unitary(
  real: Float64Array,
  imag: Float64Array,
  outReal: Float64Array,
  outImag: Float64Array,
): void {
  const size = real.length;
  if (size === 0) {
    return;
  }

  // Small sizes: the cached dense sine mat-vec beats the odd-extension FFT
  // (whose length 2(N+1) is rarely a power of two, forcing Bluestein).
  if (size < DST_DENSE_CROSSOVER && !isPowerOfTwo(2 * (size + 1))) {
    denseDst1Unitary(real, imag, outReal, outImag);
    return;
  }

  const plan = getDst1Plan(size);
  const { extendedSize, normalization, scratchReal, scratchImag } = plan;

  scratchReal[0] = 0;
  scratchImag[0] = 0;
  scratchReal[size + 1] = 0;
  scratchImag[size + 1] = 0;
  for (let index = 0; index < size; index += 1) {
    scratchReal[index + 1] = real[index];
    scratchImag[index + 1] = imag[index];
    scratchReal[extendedSize - 1 - index] = -real[index];
    scratchImag[extendedSize - 1 - index] = -imag[index];
  }

  if (isPowerOfTwo(extendedSize)) {
    fftPow2InPlace(scratchReal, scratchImag, extendedSize, -1);
  } else {
    dftUnnormalized(scratchReal, scratchImag, scratchReal, scratchImag, -1);
  }

  // S_m = (i/2) * Y_m  =>  re = -Y_im/2, im = Y_re/2, for m = 1..N.
  for (let index = 0; index < size; index += 1) {
    const spectrumReal = scratchReal[index + 1];
    const spectrumImag = scratchImag[index + 1];
    outReal[index] = -0.5 * normalization * spectrumImag;
    outImag[index] = 0.5 * normalization * spectrumReal;
  }
}

const denseSineTableCache = new Map<number, Float64Array>();

function getDenseSineTable(size: number): Float64Array {
  const cached = denseSineTableCache.get(size);
  if (cached !== undefined) {
    return cached;
  }

  const values = new Float64Array(size * size);
  for (let mode = 0; mode < size; mode += 1) {
    for (let sample = 0; sample < size; sample += 1) {
      values[mode * size + sample] = Math.sin(
        (Math.PI * (mode + 1) * (sample + 1)) / (size + 1),
      );
    }
  }
  denseSineTableCache.set(size, values);
  return values;
}

function denseDst1Unitary(
  real: Float64Array,
  imag: Float64Array,
  outReal: Float64Array,
  outImag: Float64Array,
): void {
  const size = real.length;
  const table = getDenseSineTable(size);
  const normalization = Math.sqrt(2 / (size + 1));
  const scratch = getDenseScratch(size);
  scratch.real.set(real);
  scratch.imag.set(imag);

  for (let mode = 0; mode < size; mode += 1) {
    const offset = mode * size;
    let sumReal = 0;
    let sumImag = 0;
    for (let sample = 0; sample < size; sample += 1) {
      const basis = table[offset + sample];
      sumReal += basis * scratch.real[sample];
      sumImag += basis * scratch.imag[sample];
    }
    outReal[mode] = normalization * sumReal;
    outImag[mode] = normalization * sumImag;
  }
}

const rowScratchCache = new Map<number, { real: Float64Array; imag: Float64Array }>();

function getRowScratch(size: number): { real: Float64Array; imag: Float64Array } {
  const cached = rowScratchCache.get(size);
  if (cached !== undefined) {
    return cached;
  }
  const scratch = { real: new Float64Array(size), imag: new Float64Array(size) };
  rowScratchCache.set(size, scratch);
  return scratch;
}

type Transform1D = (
  real: Float64Array,
  imag: Float64Array,
  outReal: Float64Array,
  outImag: Float64Array,
) => void;

/**
 * Applies a 1D transform along every row and then every column of a
 * size x size row-major grid. Matches the separable dense 2D reference
 * transforms in `initialStates2d.ts`.
 */
function applySeparable2D(
  transform: Transform1D,
  real: Float64Array,
  imag: Float64Array,
  size: number,
  outReal: Float64Array,
  outImag: Float64Array,
): void {
  const scratch = getRowScratch(size);

  for (let row = 0; row < size; row += 1) {
    const offset = row * size;
    scratch.real.set(real.subarray(offset, offset + size));
    scratch.imag.set(imag.subarray(offset, offset + size));
    transform(scratch.real, scratch.imag, scratch.real, scratch.imag);
    outReal.set(scratch.real, offset);
    outImag.set(scratch.imag, offset);
  }

  for (let column = 0; column < size; column += 1) {
    for (let row = 0; row < size; row += 1) {
      const index = row * size + column;
      scratch.real[row] = outReal[index];
      scratch.imag[row] = outImag[index];
    }
    transform(scratch.real, scratch.imag, scratch.real, scratch.imag);
    for (let row = 0; row < size; row += 1) {
      const index = row * size + column;
      outReal[index] = scratch.real[row];
      outImag[index] = scratch.imag[row];
    }
  }
}

/** Fast separable 2D unitary forward DFT matching `discreteFourierTransform2D`. */
export function fastForwardDftUnitary2D(
  real: Float64Array,
  imag: Float64Array,
  size: number,
  outReal: Float64Array,
  outImag: Float64Array,
): void {
  applySeparable2D(fastForwardDftUnitary, real, imag, size, outReal, outImag);
}

/** Fast separable 2D unitary inverse DFT matching `inverseDiscreteFourierTransform2D`. */
export function fastInverseDftUnitary2D(
  real: Float64Array,
  imag: Float64Array,
  size: number,
  outReal: Float64Array,
  outImag: Float64Array,
): void {
  applySeparable2D(fastInverseDftUnitary, real, imag, size, outReal, outImag);
}

/** Fast separable 2D orthonormal DST-I matching `sineTransform2D` (involutory). */
export function fastDst1Unitary2D(
  real: Float64Array,
  imag: Float64Array,
  interiorSize: number,
  outReal: Float64Array,
  outImag: Float64Array,
): void {
  applySeparable2D(fastDst1Unitary, real, imag, interiorSize, outReal, outImag);
}
