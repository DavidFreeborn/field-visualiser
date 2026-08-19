import type {
  Quantum2DFixedConfig,
  Quantum2DFixedDiagnostics,
  Quantum2DFixedQuantity,
} from '../../physics/quantum/quantum2dFixed';
import type {
  Quantum2DPeriodicConfig,
  Quantum2DPeriodicDiagnostics,
  Quantum2DPeriodicQuantity,
} from '../../physics/quantum/quantum2dPeriodic';
import type { Quantum2DDisplaySnapshot } from '../../physics/quantum/quantum2dDisplay';

export type Quantum2DGeometry = 'square-fixed' | 'torus-periodic';
export type Quantum2DConfig = Quantum2DFixedConfig | Quantum2DPeriodicConfig;
export type Quantum2DQuantity = Quantum2DFixedQuantity | Quantum2DPeriodicQuantity;
export type Quantum2DSnapshot = Quantum2DDisplaySnapshot;
export type Quantum2DDiagnostics = Quantum2DFixedDiagnostics | Quantum2DPeriodicDiagnostics;

/**
 * Latest-target-time protocol.
 *
 * The main thread keeps at most ONE request in flight. Every request carries a
 * monotonically increasing `generation`; a new configuration, geometry,
 * quantity, or reset bumps the generation, so replies from an older
 * configuration are recognisably stale and dropped by the scheduler.
 *
 * `set-time` carries an absolute simulation target time. While a calculation
 * is in flight the main thread only remembers the newest desired time;
 * intermediate targets are coalesced away. `recycledBuffer` optionally returns
 * a previously received display buffer to the worker so steady-state playback
 * ping-pongs two buffers instead of allocating.
 */
export type Quantum2DWorkerRequest =
  | {
      readonly type: 'configure';
      readonly generation: number;
      readonly geometry: Quantum2DGeometry;
      readonly config: Quantum2DConfig;
      readonly quantity: Quantum2DQuantity;
    }
  | {
      readonly type: 'set-quantity';
      readonly generation: number;
      readonly quantity: Quantum2DQuantity;
    }
  | {
      readonly type: 'set-time';
      readonly generation: number;
      readonly targetTime: number;
      /** Display buffers handed back for reuse (transferred with the message). */
      readonly recycledBuffers?: ArrayBuffer[];
    };

/** Per-reply worker-side timings for end-to-end profiling. */
export interface Quantum2DWorkerTimings {
  /** Modal phase update + inverse transform, in milliseconds. */
  readonly computeMs: number;
  /** Display-buffer construction, in milliseconds. */
  readonly snapshotMs: number;
}

export type Quantum2DWorkerResponse =
  | {
      readonly type: 'state';
      readonly generation: number;
      readonly snapshot: Quantum2DSnapshot;
      readonly diagnostics: Quantum2DDiagnostics;
      readonly timings: Quantum2DWorkerTimings;
    }
  | {
      readonly type: 'error';
      readonly generation: number;
      readonly message: string;
    };
