import {
  fastDst1Unitary,
  fastDst1Unitary2D,
  fastForwardDftUnitary,
  fastForwardDftUnitary2D,
  fastInverseDftUnitary,
  fastInverseDftUnitary2D,
} from '../../physics/core/fft';
import {
  computeDiscreteNorm,
  discreteFourierTransform,
  inverseDiscreteFourierTransform,
} from '../../physics/quantum/initialStates';
import {
  discreteFourierTransform2D,
  inverseDiscreteFourierTransform2D,
  sineTransform2D,
} from '../../physics/quantum/initialStates2d';

const TOLERANCE = 1e-10;

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff - 0.5;
  };
}

function randomComplex(size: number, seed: number): { real: Float64Array; imaginary: Float64Array } {
  const random = createSeededRandom(seed);
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    real[index] = random();
    imaginary[index] = random();
  }
  return { real, imaginary };
}

function expectClose(actual: Float64Array, expected: Float64Array, label: string): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    if (Math.abs(actual[index] - expected[index]) > TOLERANCE) {
      throw new Error(
        `${label}[${index}]: got ${actual[index]}, expected ${expected[index]} ` +
          `(difference ${Math.abs(actual[index] - expected[index])})`,
      );
    }
  }
}

// Dense reference DST-I (orthonormal), copied convention from quantum1dFixed.ts.
function referenceDst1(
  real: Float64Array,
  imaginary: Float64Array,
): { real: Float64Array; imaginary: Float64Array } {
  const interiorCount = real.length;
  const outReal = new Float64Array(interiorCount);
  const outImaginary = new Float64Array(interiorCount);
  const normalization = Math.sqrt(2 / (interiorCount + 1));

  for (let modeIndex = 0; modeIndex < interiorCount; modeIndex += 1) {
    let sumReal = 0;
    let sumImaginary = 0;
    for (let siteIndex = 0; siteIndex < interiorCount; siteIndex += 1) {
      const basisValue =
        normalization *
        Math.sin((Math.PI * (modeIndex + 1) * (siteIndex + 1)) / (interiorCount + 1));
      sumReal += basisValue * real[siteIndex];
      sumImaginary += basisValue * imaginary[siteIndex];
    }
    outReal[modeIndex] = sumReal;
    outImaginary[modeIndex] = sumImaginary;
  }

  return { real: outReal, imaginary: outImaginary };
}

// Sizes chosen to cover the radix-2 path, the Bluestein path (including
// primes), and the interior sizes produced by the fixed-end UI options.
const SIZES_1D = [8, 12, 15, 16, 17, 30, 31, 32, 64, 127];

describe('fastForwardDftUnitary / fastInverseDftUnitary', () => {
  it.each(SIZES_1D)('matches the dense unitary DFT for random input at N=%i', (size) => {
    const { real, imaginary } = randomComplex(size, size * 7 + 1);
    const expected = discreteFourierTransform(real, imaginary);
    const outReal = new Float64Array(size);
    const outImaginary = new Float64Array(size);

    fastForwardDftUnitary(real, imaginary, outReal, outImaginary);

    expectClose(outReal, expected.real, 'real');
    expectClose(outImaginary, expected.imaginary, 'imaginary');
  });

  it.each(SIZES_1D)('matches the dense unitary inverse DFT at N=%i', (size) => {
    const { real, imaginary } = randomComplex(size, size * 13 + 5);
    const expected = inverseDiscreteFourierTransform(real, imaginary);
    const outReal = new Float64Array(size);
    const outImaginary = new Float64Array(size);

    fastInverseDftUnitary(real, imaginary, outReal, outImaginary);

    expectClose(outReal, expected.real, 'real');
    expectClose(outImaginary, expected.imaginary, 'imaginary');
  });

  it('resolves a site-localized state into a flat spectrum (periodic wraparound)', () => {
    const size = 24;
    const real = new Float64Array(size);
    const imaginary = new Float64Array(size);
    real[5] = 1;

    const outReal = new Float64Array(size);
    const outImaginary = new Float64Array(size);
    fastForwardDftUnitary(real, imaginary, outReal, outImaginary);

    const expectedMagnitude = 1 / Math.sqrt(size);
    for (let index = 0; index < size; index += 1) {
      const magnitude = Math.hypot(outReal[index], outImaginary[index]);
      expect(magnitude).toBeCloseTo(expectedMagnitude, 12);
    }
  });

  it('recovers a Gaussian packet through a forward-inverse round trip', () => {
    const size = 40;
    const real = new Float64Array(size);
    const imaginary = new Float64Array(size);
    for (let index = 0; index < size; index += 1) {
      const delta = (index / size - 0.5) / 0.1;
      real[index] = Math.exp(-0.5 * delta * delta) * Math.cos(index);
      imaginary[index] = Math.exp(-0.5 * delta * delta) * Math.sin(index);
    }

    const modeReal = new Float64Array(size);
    const modeImaginary = new Float64Array(size);
    fastForwardDftUnitary(real, imaginary, modeReal, modeImaginary);
    const roundTripReal = new Float64Array(size);
    const roundTripImaginary = new Float64Array(size);
    fastInverseDftUnitary(modeReal, modeImaginary, roundTripReal, roundTripImaginary);

    expectClose(roundTripReal, real, 'roundTripReal');
    expectClose(roundTripImaginary, imaginary, 'roundTripImaginary');
  });

  it.each(SIZES_1D)('preserves the norm (unitarity) at N=%i', (size) => {
    const { real, imaginary } = randomComplex(size, size + 99);
    const inputNorm = computeDiscreteNorm(real, imaginary);
    const outReal = new Float64Array(size);
    const outImaginary = new Float64Array(size);

    fastForwardDftUnitary(real, imaginary, outReal, outImaginary);

    expect(computeDiscreteNorm(outReal, outImaginary)).toBeCloseTo(inputNorm, 10);
  });

  it('supports selecting a single mode (delta spectrum -> plane wave)', () => {
    const size = 18;
    const modeReal = new Float64Array(size);
    const modeImaginary = new Float64Array(size);
    modeReal[3] = 1;

    const outReal = new Float64Array(size);
    const outImaginary = new Float64Array(size);
    fastInverseDftUnitary(modeReal, modeImaginary, outReal, outImaginary);

    const normalization = 1 / Math.sqrt(size);
    for (let index = 0; index < size; index += 1) {
      const phase = (2 * Math.PI * 3 * index) / size;
      expect(outReal[index]).toBeCloseTo(normalization * Math.cos(phase), 12);
      expect(outImaginary[index]).toBeCloseTo(normalization * Math.sin(phase), 12);
    }
  });

  it('is safe to run in place (out aliasing in)', () => {
    const size = 20;
    const { real, imaginary } = randomComplex(size, 4242);
    const expected = discreteFourierTransform(real, imaginary);

    fastForwardDftUnitary(real, imaginary, real, imaginary);

    expectClose(real, expected.real, 'real');
    expectClose(imaginary, expected.imaginary, 'imaginary');
  });
});

describe('fastDst1Unitary', () => {
  // Interior sizes from the fixed-end UI options (siteCount - 2) plus primes.
  const DST_SIZES = [6, 7, 13, 15, 30, 31, 62, 127];

  it.each(DST_SIZES)('matches the dense DST-I for random input at N=%i', (size) => {
    const { real, imaginary } = randomComplex(size, size * 3 + 11);
    const expected = referenceDst1(real, imaginary);
    const outReal = new Float64Array(size);
    const outImaginary = new Float64Array(size);

    fastDst1Unitary(real, imaginary, outReal, outImaginary);

    expectClose(outReal, expected.real, 'real');
    expectClose(outImaginary, expected.imaginary, 'imaginary');
  });

  it.each(DST_SIZES)('is involutory (its own inverse) at N=%i', (size) => {
    const { real, imaginary } = randomComplex(size, size * 5 + 3);
    const modeReal = new Float64Array(size);
    const modeImaginary = new Float64Array(size);
    fastDst1Unitary(real, imaginary, modeReal, modeImaginary);
    const backReal = new Float64Array(size);
    const backImaginary = new Float64Array(size);
    fastDst1Unitary(modeReal, modeImaginary, backReal, backImaginary);

    expectClose(backReal, real, 'real');
    expectClose(backImaginary, imaginary, 'imaginary');
  });

  it.each(DST_SIZES)('preserves the norm at N=%i', (size) => {
    const { real, imaginary } = randomComplex(size, size * 17 + 29);
    const inputNorm = computeDiscreteNorm(real, imaginary);
    const outReal = new Float64Array(size);
    const outImaginary = new Float64Array(size);

    fastDst1Unitary(real, imaginary, outReal, outImaginary);

    expect(computeDiscreteNorm(outReal, outImaginary)).toBeCloseTo(inputNorm, 10);
  });

  it('reconstructs a pure sine mode exactly (fixed zero boundaries)', () => {
    const size = 21;
    const modeReal = new Float64Array(size);
    const modeImaginary = new Float64Array(size);
    modeReal[4] = 1;

    const siteReal = new Float64Array(size);
    const siteImaginary = new Float64Array(size);
    fastDst1Unitary(modeReal, modeImaginary, siteReal, siteImaginary);

    const normalization = Math.sqrt(2 / (size + 1));
    for (let index = 0; index < size; index += 1) {
      const expected = normalization * Math.sin((Math.PI * 5 * (index + 1)) / (size + 1));
      expect(siteReal[index]).toBeCloseTo(expected, 12);
      expect(siteImaginary[index]).toBeCloseTo(0, 12);
    }
  });
});

describe('fast 2D transforms', () => {
  const SIZES_2D = [6, 8, 12, 15];

  it.each(SIZES_2D)('2D forward DFT matches the dense reference at %ix%i', (size) => {
    const { real, imaginary } = randomComplex(size * size, size * 23 + 7);
    const expected = discreteFourierTransform2D(real.slice(), imaginary.slice(), size);
    const outReal = new Float64Array(size * size);
    const outImaginary = new Float64Array(size * size);

    fastForwardDftUnitary2D(real, imaginary, size, outReal, outImaginary);

    expectClose(outReal, expected.real, 'real');
    expectClose(outImaginary, expected.imaginary, 'imaginary');
  });

  it.each(SIZES_2D)('2D inverse DFT matches the dense reference at %ix%i', (size) => {
    const { real, imaginary } = randomComplex(size * size, size * 29 + 17);
    const expected = inverseDiscreteFourierTransform2D(real.slice(), imaginary.slice(), size);
    const outReal = new Float64Array(size * size);
    const outImaginary = new Float64Array(size * size);

    fastInverseDftUnitary2D(real, imaginary, size, outReal, outImaginary);

    expectClose(outReal, expected.real, 'real');
    expectClose(outImaginary, expected.imaginary, 'imaginary');
  });

  it.each(SIZES_2D)('2D DST-I matches the dense reference at %ix%i', (size) => {
    const { real, imaginary } = randomComplex(size * size, size * 31 + 19);
    const expected = sineTransform2D(real.slice(), imaginary.slice(), size);
    const outReal = new Float64Array(size * size);
    const outImaginary = new Float64Array(size * size);

    fastDst1Unitary2D(real, imaginary, size, outReal, outImaginary);

    expectClose(outReal, expected.real, 'real');
    expectClose(outImaginary, expected.imaginary, 'imaginary');
  });
});
