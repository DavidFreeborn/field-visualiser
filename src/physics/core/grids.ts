export function flattenIndex2D(x: number, y: number, width: number): number {
  return y * width + x;
}

export function assertSquareResolution(size: number): void {
  if (!Number.isInteger(size) || size < 4) {
    throw new Error('size must be an integer greater than or equal to 4.');
  }
}
