/**
 * A minimal imperative pub/sub channel used to hand per-frame simulation
 * snapshots straight to the renderer without routing them through React
 * state. React continues to own configuration and low-frequency UI state;
 * high-frequency numeric frames flow through this channel instead, so React
 * never reconciles large typed arrays at animation rate.
 */
export interface FrameChannel<S> {
  publish(snapshot: S): void;
  subscribe(listener: (snapshot: S) => void): () => void;
  getLatest(): S | null;
}

export function createFrameChannel<S>(): FrameChannel<S> {
  const listeners = new Set<(snapshot: S) => void>();
  let latest: S | null = null;

  return {
    publish(snapshot: S): void {
      latest = snapshot;
      for (const listener of listeners) {
        listener(snapshot);
      }
    },
    subscribe(listener: (snapshot: S) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getLatest(): S | null {
      return latest;
    },
  };
}

/**
 * Wall-clock playback bookkeeping shared by the animation loops.
 *
 * The displayed simulation clock advances by (elapsed wall time x requested
 * speed). A single frame's elapsed contribution is capped: when frames are
 * missed briefly the clock jumps to the correct target on the next frame, and
 * longer gaps (hidden tab, suspended rAF) are treated as paused time rather
 * than accumulating an unbounded catch-up remainder.
 */
export const MAX_FRAME_ELAPSED_SECONDS = 0.25;

/** Cadence for pushing diagnostics into React state (2-4 Hz band). */
export const DIAGNOSTICS_UPDATE_INTERVAL_SECONDS = 0.3;

export interface PlaybackRateSample {
  readonly windowWallSeconds: number;
  readonly windowSimulatedSeconds: number;
}

/**
 * Tracks the achieved simulation-to-wall-time ratio over the diagnostics
 * window so the UI can show when playback falls behind the requested speed.
 */
export class PlaybackRateTracker {
  private wallSeconds = 0;

  private simulatedSeconds = 0;

  private lastRatio: number | null = null;

  public addFrame(wallDelta: number, simulatedDelta: number): void {
    this.wallSeconds += wallDelta;
    this.simulatedSeconds += simulatedDelta;
  }

  /** Finishes the current window and returns the achieved ratio, or null before any data. */
  public sampleAndReset(): number | null {
    if (this.wallSeconds > 0) {
      this.lastRatio = this.simulatedSeconds / this.wallSeconds;
    }
    this.wallSeconds = 0;
    this.simulatedSeconds = 0;
    return this.lastRatio;
  }

  public get achievedRatio(): number | null {
    return this.lastRatio;
  }

  public reset(): void {
    this.wallSeconds = 0;
    this.simulatedSeconds = 0;
    this.lastRatio = null;
  }
}
