import { wrapPeriodicIndex } from './boundary';

export function applyPeriodicLaplacian1D(
  field: Float64Array,
  inverseSpacingSquared: number,
  out: Float64Array = new Float64Array(field.length),
): Float64Array {
  const { length } = field;

  if (out.length !== length) {
    throw new Error('Output array must match the field length.');
  }

  for (let index = 0; index < length; index += 1) {
    const left = field[wrapPeriodicIndex(index - 1, length)];
    const right = field[wrapPeriodicIndex(index + 1, length)];

    out[index] = (left - 2 * field[index] + right) * inverseSpacingSquared;
  }

  return out;
}

export function applyDirichletLaplacian1D(
  field: Float64Array,
  inverseSpacingSquared: number,
  out: Float64Array = new Float64Array(field.length),
): Float64Array {
  const { length } = field;

  if (out.length !== length) {
    throw new Error('Output array must match the field length.');
  }

  out[0] = 0;
  out[length - 1] = 0;

  for (let index = 1; index < length - 1; index += 1) {
    out[index] =
      (field[index - 1] - 2 * field[index] + field[index + 1]) * inverseSpacingSquared;
  }

  return out;
}
