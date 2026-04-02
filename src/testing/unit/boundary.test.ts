import { wrapPeriodicIndex } from '../../physics/core/boundary';

describe('wrapPeriodicIndex', () => {
  it('wraps negative and overflowing indices onto the periodic domain', () => {
    expect(wrapPeriodicIndex(-1, 8)).toBe(7);
    expect(wrapPeriodicIndex(8, 8)).toBe(0);
    expect(wrapPeriodicIndex(17, 8)).toBe(1);
  });
});
