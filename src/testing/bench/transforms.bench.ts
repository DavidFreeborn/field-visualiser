import { bench, describe } from 'vitest';
import {
  fastDst1Unitary,
  fastDst1Unitary2D,
  fastForwardDftUnitary2D,
  fastInverseDftUnitary,
} from '../../physics/core/fft';
import {
  discreteFourierTransform,
  inverseDiscreteFourierTransform,
} from '../../physics/quantum/initialStates';
import {
  discreteFourierTransform2D,
  sineTransform2D,
} from '../../physics/quantum/initialStates2d';

function randomComplex(size: number): { real: Float64Array; imaginary: Float64Array } {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  let state = 12345;
  for (let index = 0; index < size; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    real[index] = state / 0xffffffff - 0.5;
    state = (state * 1664525 + 1013904223) >>> 0;
    imaginary[index] = state / 0xffffffff - 0.5;
  }
  return { real, imaginary };
}

// Dense DST-I reference (same as the pre-overhaul quantum1dFixed implementation).
function denseDst1(real: Float64Array, imaginary: Float64Array): void {
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
}

for (const size of [128, 512, 2048]) {
  const input = randomComplex(size);
  const outReal = new Float64Array(size);
  const outImaginary = new Float64Array(size);

  describe(`1D periodic inverse transform N=${size}`, () => {
    bench(`dense O(N^2) inverse DFT N=${size}`, () => {
      inverseDiscreteFourierTransform(input.real, input.imaginary);
    });

    bench(`fast O(N log N) inverse DFT N=${size}`, () => {
      fastInverseDftUnitary(input.real, input.imaginary, outReal, outImaginary);
    });
  });
}

for (const size of [126, 510, 2046]) {
  const input = randomComplex(size);
  const outReal = new Float64Array(size);
  const outImaginary = new Float64Array(size);

  describe(`1D Dirichlet DST-I interior N=${size}`, () => {
    bench(`dense O(N^2) DST-I N=${size}`, () => {
      denseDst1(input.real, input.imaginary);
    });

    bench(`fast O(N log N) DST-I N=${size}`, () => {
      fastDst1Unitary(input.real, input.imaginary, outReal, outImaginary);
    });
  });
}

for (const size of [24, 48, 96]) {
  const input = randomComplex(size * size);
  const outReal = new Float64Array(size * size);
  const outImaginary = new Float64Array(size * size);

  describe(`2D periodic forward transform ${size}x${size}`, () => {
    bench(`dense separable 2D DFT ${size}x${size}`, () => {
      discreteFourierTransform2D(input.real, input.imaginary, size, outReal, outImaginary);
    });

    bench(`fast 2D DFT ${size}x${size}`, () => {
      fastForwardDftUnitary2D(input.real, input.imaginary, size, outReal, outImaginary);
    });
  });
}

for (const size of [23, 47, 79]) {
  const input = randomComplex(size * size);
  const outReal = new Float64Array(size * size);
  const outImaginary = new Float64Array(size * size);

  describe(`2D Dirichlet DST ${size}x${size}`, () => {
    bench(`dense separable 2D DST ${size}x${size}`, () => {
      sineTransform2D(input.real, input.imaginary, size, outReal, outImaginary);
    });

    bench(`fast 2D DST ${size}x${size}`, () => {
      fastDst1Unitary2D(input.real, input.imaginary, size, outReal, outImaginary);
    });
  });
}

// Prevent unused-import elision confusion in some bundlers.
void discreteFourierTransform;
