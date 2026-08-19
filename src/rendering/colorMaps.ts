/**
 * Display color maps.
 *
 * - Sequential map (non-negative quantities such as energy density, site
 *   probability, magnitude): a warm single-hue ramp with monotonically
 *   decreasing lightness, so perceived brightness orders values correctly.
 * - Diverging map (signed quantities such as displacement, velocity, real and
 *   imaginary parts): a balanced blue-cream-red ramp whose two arms have
 *   matched lightness progressions and whose midpoint is the neutral paper
 *   tone #f4f1ec (exactly zero maps to neutral).
 * - Phase map (complex amplitudes): hue encodes arg(psi) around the full
 *   color wheel; saturation/lightness are constant so no phase is visually
 *   privileged, and the color is mixed toward the paper background by
 *   normalized magnitude, so near-zero amplitude fades out regardless of its
 *   (numerically meaningless) phase.
 *
 * All maps are precomputed 256-entry lookup tables; per-pixel mapping is a
 * clamp, a multiply, and an array read.
 */

interface ColorStop {
  readonly t: number;
  readonly color: number;
}

const SEQUENTIAL_STOPS: readonly ColorStop[] = [
  { t: 0, color: 0xfffaf7 },
  { t: 0.3, color: 0xf2c9a8 },
  { t: 0.6, color: 0xd96f4a },
  { t: 0.85, color: 0xa32525 },
  { t: 1, color: 0x5c1216 },
];

const DIVERGING_STOPS: readonly ColorStop[] = [
  { t: 0, color: 0x1d4f8f },
  { t: 0.25, color: 0x8aa8cc },
  { t: 0.5, color: 0xf4f1ec },
  { t: 0.75, color: 0xd08a72 },
  { t: 1, color: 0x9f1f27 },
];

const LUT_SIZE = 256;

function buildLut(stops: readonly ColorStop[]): Uint32Array {
  const lut = new Uint32Array(LUT_SIZE);

  for (let index = 0; index < LUT_SIZE; index += 1) {
    const t = index / (LUT_SIZE - 1);
    let upper = 1;
    while (upper < stops.length - 1 && stops[upper].t < t) {
      upper += 1;
    }
    const a = stops[upper - 1];
    const b = stops[upper];
    const span = b.t - a.t;
    const localT = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    lut[index] = mixColors(a.color, b.color, localT);
  }

  return lut;
}

function mixColors(colorA: number, colorB: number, t: number): number {
  const redA = (colorA >> 16) & 0xff;
  const greenA = (colorA >> 8) & 0xff;
  const blueA = colorA & 0xff;
  const redB = (colorB >> 16) & 0xff;
  const greenB = (colorB >> 8) & 0xff;
  const blueB = colorB & 0xff;

  return channelsToNumber(
    redA + (redB - redA) * t,
    greenA + (greenB - greenA) * t,
    blueA + (blueB - blueA) * t,
  );
}

const sequentialLut = buildLut(SEQUENTIAL_STOPS);
const divergingLut = buildLut(DIVERGING_STOPS);

const PHASE_LUT_SIZE = 256;
const phaseLut = buildPhaseLut();

function buildPhaseLut(): Uint32Array {
  const lut = new Uint32Array(PHASE_LUT_SIZE);
  for (let index = 0; index < PHASE_LUT_SIZE; index += 1) {
    const hue = (360 * index) / PHASE_LUT_SIZE;
    lut[index] = hslToNumber(hue, 0.62, 0.5);
  }
  return lut;
}

function hslToNumber(hue: number, saturation: number, lightness: number): number {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime < 1) {
    [red, green, blue] = [chroma, x, 0];
  } else if (huePrime < 2) {
    [red, green, blue] = [x, chroma, 0];
  } else if (huePrime < 3) {
    [red, green, blue] = [0, chroma, x];
  } else if (huePrime < 4) {
    [red, green, blue] = [0, x, chroma];
  } else if (huePrime < 5) {
    [red, green, blue] = [x, 0, chroma];
  } else {
    [red, green, blue] = [chroma, 0, x];
  }

  const m = lightness - chroma / 2;
  return channelsToNumber((red + m) * 255, (green + m) * 255, (blue + m) * 255);
}

const PHASE_BACKGROUND = 0xfcfaf7;

function clampChannel(channel: number): number {
  return Math.max(0, Math.min(255, Math.round(channel)));
}

function channelsToNumber(red: number, green: number, blue: number): number {
  return (clampChannel(red) << 16) | (clampChannel(green) << 8) | clampChannel(blue);
}

export function mapSignedValueToDivergingColor(value: number, maxMagnitude: number): string {
  const colorNumber = mapSignedValueToDivergingNumber(value, maxMagnitude);
  return `#${colorNumber.toString(16).padStart(6, '0')}`;
}

export function mapSignedValueToDivergingNumber(value: number, maxMagnitude: number): number {
  if (maxMagnitude <= 0 || value === 0) {
    return 0xf4f1ec;
  }

  const normalized = Math.max(-1, Math.min(1, value / maxMagnitude));
  const index = Math.round(((normalized + 1) / 2) * (LUT_SIZE - 1));
  return divergingLut[index];
}

export function mapDensityToSequentialColor(value: number, maxValue: number): string {
  const colorNumber = mapDensityToSequentialNumber(value, maxValue);
  return `#${colorNumber.toString(16).padStart(6, '0')}`;
}

export function mapDensityToSequentialNumber(value: number, maxValue: number): number {
  if (maxValue <= 0) {
    return SEQUENTIAL_STOPS[0].color;
  }

  const normalized = Math.max(0, Math.min(1, value / maxValue));
  return sequentialLut[Math.round(normalized * (LUT_SIZE - 1))];
}

/**
 * Complex-amplitude color: hue = phase, mixed toward the paper background by
 * normalized magnitude.
 */
export function mapPhaseMagnitudeToNumber(
  phase: number,
  magnitude: number,
  maxMagnitude: number,
): number {
  const normalizedMagnitude =
    maxMagnitude > 0 ? Math.max(0, Math.min(1, magnitude / maxMagnitude)) : 0;
  const wrapped = phase - Math.floor(phase / (2 * Math.PI)) * 2 * Math.PI;
  const hueIndex = Math.min(
    PHASE_LUT_SIZE - 1,
    Math.floor((wrapped / (2 * Math.PI)) * PHASE_LUT_SIZE),
  );
  return mixColors(PHASE_BACKGROUND, phaseLut[hueIndex], normalizedMagnitude);
}

export function hexToNumber(hexColor: string): number {
  return Number.parseInt(hexColor.slice(1), 16);
}

function numberToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** CSS gradient matching the sequential map, for on-page legends. */
export function getSequentialCssGradient(): string {
  return `linear-gradient(90deg, ${SEQUENTIAL_STOPS.map(
    (stop) => `${numberToHex(stop.color)} ${Math.round(stop.t * 100)}%`,
  ).join(', ')})`;
}

/** CSS gradient matching the diverging map, for on-page legends. */
export function getDivergingCssGradient(): string {
  return `linear-gradient(90deg, ${DIVERGING_STOPS.map(
    (stop) => `${numberToHex(stop.color)} ${Math.round(stop.t * 100)}%`,
  ).join(', ')})`;
}

/** CSS conic gradient matching the phase wheel, for the phase legend. */
export function getPhaseWheelCssGradient(): string {
  const stops: string[] = [];
  for (let step = 0; step <= 8; step += 1) {
    const hueIndex = Math.min(PHASE_LUT_SIZE - 1, Math.round((step / 8) * PHASE_LUT_SIZE));
    stops.push(`${numberToHex(phaseLut[hueIndex % PHASE_LUT_SIZE])} ${Math.round((step / 8) * 360)}deg`);
  }
  return `conic-gradient(from 90deg, ${stops.join(', ')})`;
}
