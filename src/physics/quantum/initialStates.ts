export type Quantum1DInitialPreset =
  | 'site-localized'
  | 'gaussian-wavepacket'
  | 'selected-normal-mode'
  | 'counterpropagating-superposition';

export interface QuantumInitialStateOptions {
  readonly siteCount: number;
  readonly amplitudeCenter: number;
  readonly gaussianWidth: number;
  readonly modeNumber: number;
  readonly momentumWidth: number;
}

export interface ComplexStateVector {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
}

export function createQuantumInitialState(
  preset: Quantum1DInitialPreset,
  options: QuantumInitialStateOptions,
): ComplexStateVector {
  switch (preset) {
    case 'site-localized':
      return normalizeState(createSiteLocalizedState(options.siteCount));
    case 'gaussian-wavepacket':
      return normalizeState(
        createGaussianWavepacketState(
          options.siteCount,
          options.amplitudeCenter,
          options.gaussianWidth,
          options.modeNumber,
        ),
      );
    case 'selected-normal-mode':
      return createNormalModeState(options.siteCount, options.modeNumber);
    case 'counterpropagating-superposition':
      return normalizeState(
        createCounterpropagatingState(
          options.siteCount,
          options.modeNumber,
          options.momentumWidth,
        ),
      );
  }
}

function createSiteLocalizedState(siteCount: number): ComplexStateVector {
  const real = new Float64Array(siteCount);
  const imaginary = new Float64Array(siteCount);

  real[Math.floor(siteCount / 2)] = 1;

  return { real, imaginary };
}

function createGaussianWavepacketState(
  siteCount: number,
  center: number,
  width: number,
  modeNumber: number,
): ComplexStateVector {
  const real = new Float64Array(siteCount);
  const imaginary = new Float64Array(siteCount);

  for (let index = 0; index < siteCount; index += 1) {
    const position = index / siteCount;
    const delta = shortestPeriodicDistance(position, center);
    const envelope = Math.exp(-0.5 * (delta / width) * (delta / width));
    const phase = (2 * Math.PI * modeNumber * index) / siteCount;

    real[index] = envelope * Math.cos(phase);
    imaginary[index] = envelope * Math.sin(phase);
  }

  return { real, imaginary };
}

function createNormalModeState(siteCount: number, modeNumber: number): ComplexStateVector {
  const real = new Float64Array(siteCount);
  const imaginary = new Float64Array(siteCount);
  const normalization = 1 / Math.sqrt(siteCount);

  for (let index = 0; index < siteCount; index += 1) {
    const phase = (2 * Math.PI * modeNumber * index) / siteCount;
    real[index] = normalization * Math.cos(phase);
    imaginary[index] = normalization * Math.sin(phase);
  }

  return { real, imaginary };
}

function createCounterpropagatingState(
  siteCount: number,
  modeNumber: number,
  momentumWidth: number,
): ComplexStateVector {
  const weightsReal = new Float64Array(siteCount);
  const weightsImaginary = new Float64Array(siteCount);

  for (let modeIndex = 0; modeIndex < siteCount; modeIndex += 1) {
    const wrappedMode = wrapModeDistance(modeIndex, modeNumber, siteCount);
    const mirroredMode = wrapModeDistance(modeIndex, -modeNumber, siteCount);
    const weight =
      Math.exp(-0.5 * (wrappedMode / momentumWidth) * (wrappedMode / momentumWidth)) +
      Math.exp(-0.5 * (mirroredMode / momentumWidth) * (mirroredMode / momentumWidth));

    weightsReal[modeIndex] = weight;
  }

  return inverseDiscreteFourierTransform(weightsReal, weightsImaginary);
}

export function normalizeState(state: ComplexStateVector): ComplexStateVector {
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

export function computeDiscreteNorm(real: Float64Array, imaginary: Float64Array): number {
  let total = 0;

  for (let index = 0; index < real.length; index += 1) {
    total += real[index] * real[index] + imaginary[index] * imaginary[index];
  }

  return total;
}

export function discreteFourierTransform(
  real: Float64Array,
  imaginary: Float64Array,
): ComplexStateVector {
  const siteCount = real.length;
  const outReal = new Float64Array(siteCount);
  const outImaginary = new Float64Array(siteCount);
  const normalization = 1 / Math.sqrt(siteCount);

  for (let modeIndex = 0; modeIndex < siteCount; modeIndex += 1) {
    let sumReal = 0;
    let sumImaginary = 0;

    for (let siteIndex = 0; siteIndex < siteCount; siteIndex += 1) {
      const phase = (-2 * Math.PI * modeIndex * siteIndex) / siteCount;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);

      sumReal += real[siteIndex] * cosPhase - imaginary[siteIndex] * sinPhase;
      sumImaginary += real[siteIndex] * sinPhase + imaginary[siteIndex] * cosPhase;
    }

    outReal[modeIndex] = normalization * sumReal;
    outImaginary[modeIndex] = normalization * sumImaginary;
  }

  return { real: outReal, imaginary: outImaginary };
}

export function inverseDiscreteFourierTransform(
  real: Float64Array,
  imaginary: Float64Array,
): ComplexStateVector {
  const siteCount = real.length;
  const outReal = new Float64Array(siteCount);
  const outImaginary = new Float64Array(siteCount);
  const normalization = 1 / Math.sqrt(siteCount);

  for (let siteIndex = 0; siteIndex < siteCount; siteIndex += 1) {
    let sumReal = 0;
    let sumImaginary = 0;

    for (let modeIndex = 0; modeIndex < siteCount; modeIndex += 1) {
      const phase = (2 * Math.PI * modeIndex * siteIndex) / siteCount;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);

      sumReal += real[modeIndex] * cosPhase - imaginary[modeIndex] * sinPhase;
      sumImaginary += real[modeIndex] * sinPhase + imaginary[modeIndex] * cosPhase;
    }

    outReal[siteIndex] = normalization * sumReal;
    outImaginary[siteIndex] = normalization * sumImaginary;
  }

  return { real: outReal, imaginary: outImaginary };
}

function shortestPeriodicDistance(position: number, center: number): number {
  const rawDelta = position - center;

  return rawDelta - Math.round(rawDelta);
}

function wrapModeDistance(modeIndex: number, centerMode: number, siteCount: number): number {
  const rawDelta = modeIndex - centerMode;

  return rawDelta - Math.round(rawDelta / siteCount) * siteCount;
}
