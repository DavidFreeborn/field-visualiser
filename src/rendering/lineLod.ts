/**
 * Screen-space level-of-detail aggregation for 1D traces.
 *
 * Simulation resolution and rendering resolution are separate concerns: once
 * the lattice has more sites than the trace has device pixels, extra
 * primitives cannot add visual information. This module folds N lattice
 * values into at most `pixelBudget` bins:
 *
 * - Signed quantities keep a per-bin min/max envelope, so narrow peaks are
 *   never lost, plus the per-bin mean for the centre line.
 * - Non-negative quantities (site probability, energy density) are aggregated
 *   by the per-bin MEAN. With equal-width bins the mean preserves the
 *   discrete integral (sum over bins of mean x binWidth = sum over sites),
 *   so total probability/energy shown is conserved; the per-bin max is also
 *   retained so the renderer can outline narrow peaks that the mean smooths.
 *
 * Buffers are reused across calls; steady-state playback performs no
 * typed-array allocation.
 */

export interface LineLodResult {
  /** Number of aggregated bins actually filled. */
  readonly count: number;
  /** True when values were folded (input length exceeded the budget). */
  readonly binned: boolean;
  readonly min: Float64Array;
  readonly max: Float64Array;
  readonly mean: Float64Array;
}

export class LineLodAggregator {
  private min = new Float64Array(0);

  private max = new Float64Array(0);

  private mean = new Float64Array(0);

  public aggregate(values: ArrayLike<number>, pixelBudget: number): LineLodResult {
    const budget = Math.max(2, Math.floor(pixelBudget));
    const length = values.length;

    if (length <= budget) {
      this.ensureCapacity(length);
      for (let index = 0; index < length; index += 1) {
        const value = values[index];
        this.min[index] = value;
        this.max[index] = value;
        this.mean[index] = value;
      }
      return { count: length, binned: false, min: this.min, max: this.max, mean: this.mean };
    }

    this.ensureCapacity(budget);

    let writeIndex = 0;
    let cursor = 0;
    for (let bin = 0; bin < budget; bin += 1) {
      // Even partition: bin sizes differ by at most one sample.
      const end = Math.floor(((bin + 1) * length) / budget);
      let binMin = Number.POSITIVE_INFINITY;
      let binMax = Number.NEGATIVE_INFINITY;
      let sum = 0;
      const binSize = end - cursor;

      for (; cursor < end; cursor += 1) {
        const value = values[cursor];
        if (value < binMin) {
          binMin = value;
        }
        if (value > binMax) {
          binMax = value;
        }
        sum += value;
      }

      if (binSize > 0) {
        this.min[writeIndex] = binMin;
        this.max[writeIndex] = binMax;
        this.mean[writeIndex] = sum / binSize;
        writeIndex += 1;
      }
    }

    return { count: writeIndex, binned: true, min: this.min, max: this.max, mean: this.mean };
  }

  private ensureCapacity(size: number): void {
    if (this.min.length < size) {
      this.min = new Float64Array(size);
      this.max = new Float64Array(size);
      this.mean = new Float64Array(size);
    }
  }
}

/**
 * Number of useful samples for a trace of the given on-screen length.
 * `cssLength` is the drawn length in CSS pixels (line width or ring
 * circumference); the budget is that length times the effective device pixel
 * ratio, hard-capped so pathological displays cannot re-inflate work.
 */
export const MAX_LINE_PIXEL_BUDGET = 4096;

export function computePixelBudget(cssLength: number, devicePixelRatio: number): number {
  const effectiveRatio = Math.min(Math.max(devicePixelRatio, 0.5), 2);
  return Math.max(16, Math.min(MAX_LINE_PIXEL_BUDGET, Math.ceil(cssLength * effectiveRatio)));
}
