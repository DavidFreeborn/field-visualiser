import {
  computePixelBudget,
  LineLodAggregator,
  MAX_LINE_PIXEL_BUDGET,
} from '../../rendering/lineLod';

function makeValues(length: number, fn: (index: number) => number): Float64Array {
  const values = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = fn(index);
  }
  return values;
}

describe('LineLodAggregator', () => {
  it('passes values through unchanged when under the budget', () => {
    const aggregator = new LineLodAggregator();
    const values = makeValues(100, (index) => Math.sin(index));

    const result = aggregator.aggregate(values, 500);

    expect(result.binned).toBe(false);
    expect(result.count).toBe(100);
    for (let index = 0; index < 100; index += 1) {
      expect(result.mean[index]).toBe(values[index]);
      expect(result.min[index]).toBe(values[index]);
      expect(result.max[index]).toBe(values[index]);
    }
  });

  it('bounds the bin count by the pixel budget', () => {
    const aggregator = new LineLodAggregator();
    const values = makeValues(2048, (index) => Math.sin(index * 0.1));

    const result = aggregator.aggregate(values, 300);

    expect(result.binned).toBe(true);
    expect(result.count).toBeLessThanOrEqual(300);
  });

  it('preserves global extrema through the min/max envelope', () => {
    const aggregator = new LineLodAggregator();
    // A single narrow spike that naive decimation would miss.
    const values = makeValues(2048, (index) => (index === 777 ? 5 : Math.sin(index * 0.01)));

    const result = aggregator.aggregate(values, 200);

    let envelopeMax = Number.NEGATIVE_INFINITY;
    let envelopeMin = Number.POSITIVE_INFINITY;
    for (let bin = 0; bin < result.count; bin += 1) {
      envelopeMax = Math.max(envelopeMax, result.max[bin]);
      envelopeMin = Math.min(envelopeMin, result.min[bin]);
    }

    expect(envelopeMax).toBe(5);
    expect(envelopeMin).toBeCloseTo(Math.min(...Array.from(values)), 12);
  });

  it('preserves a negative spike in the min envelope', () => {
    const aggregator = new LineLodAggregator();
    const values = makeValues(4096, (index) => (index === 1234 ? -3 : 0));

    const result = aggregator.aggregate(values, 128);

    let envelopeMin = Number.POSITIVE_INFINITY;
    for (let bin = 0; bin < result.count; bin += 1) {
      envelopeMin = Math.min(envelopeMin, result.min[bin]);
    }
    expect(envelopeMin).toBe(-3);
  });

  it('conserves total probability under mean aggregation with equal-weight bins', () => {
    const aggregator = new LineLodAggregator();
    // A normalized probability vector.
    const raw = makeValues(2048, (index) => {
      const z = (index - 1000) / 90;
      return Math.exp(-z * z);
    });
    let total = 0;
    for (const value of raw) {
      total += value;
    }
    const probabilities = makeValues(2048, (index) => raw[index] / total);

    const result = aggregator.aggregate(probabilities, 256);

    // Reconstruct the total from bin means weighted by exact bin sizes.
    let reconstructed = 0;
    let cursor = 0;
    for (let bin = 0; bin < result.count; bin += 1) {
      const end = Math.floor(((bin + 1) * probabilities.length) / result.count);
      reconstructed += result.mean[bin] * (end - cursor);
      cursor = end;
    }

    expect(reconstructed).toBeCloseTo(1, 12);
  });

  it('reuses its buffers across calls (no steady-state allocation)', () => {
    const aggregator = new LineLodAggregator();
    const values = makeValues(2048, (index) => Math.sin(index * 0.01));

    const first = aggregator.aggregate(values, 256);
    const firstMin = first.min;
    const second = aggregator.aggregate(values, 256);

    expect(second.min).toBe(firstMin);
  });
});

describe('computePixelBudget', () => {
  it('scales with CSS length and device pixel ratio', () => {
    expect(computePixelBudget(500, 1)).toBe(500);
    expect(computePixelBudget(500, 2)).toBe(1000);
  });

  it('caps the device pixel ratio contribution at 2', () => {
    expect(computePixelBudget(500, 3)).toBe(1000);
  });

  it('never exceeds the hard budget cap', () => {
    expect(computePixelBudget(1e9, 2)).toBe(MAX_LINE_PIXEL_BUDGET);
  });
});
