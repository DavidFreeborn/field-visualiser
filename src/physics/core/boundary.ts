export function wrapPeriodicIndex(index: number, length: number): number {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`Expected a positive integer length, received ${length}.`);
  }

  return ((index % length) + length) % length;
}
