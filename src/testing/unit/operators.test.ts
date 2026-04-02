import { applyPeriodicLaplacian1D } from '../../physics/core/operators';

describe('applyPeriodicLaplacian1D', () => {
  it('annihilates a constant field', () => {
    const field = new Float64Array([2, 2, 2, 2]);

    expect(Array.from(applyPeriodicLaplacian1D(field, 1))).toEqual([0, 0, 0, 0]);
  });

  it('matches the discrete Laplacian of a cosine mode', () => {
    const siteCount = 8;
    const field = new Float64Array(siteCount);

    for (let index = 0; index < siteCount; index += 1) {
      field[index] = Math.cos((2 * Math.PI * index) / siteCount);
    }

    const laplacian = applyPeriodicLaplacian1D(field, 1);
    const eigenvalue = 2 * Math.cos((2 * Math.PI) / siteCount) - 2;

    for (let index = 0; index < siteCount; index += 1) {
      expect(laplacian[index]).toBeCloseTo(eigenvalue * field[index], 10);
    }
  });
});
