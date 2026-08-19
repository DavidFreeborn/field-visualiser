import type {
  Quantum2DConfig,
  Quantum2DGeometry,
  Quantum2DQuantity,
  Quantum2DWorkerRequest,
  Quantum2DWorkerResponse,
} from './quantum2DProtocol';

export interface PostMessageTarget {
  postMessage(message: Quantum2DWorkerRequest, transfer?: Transferable[]): void;
}

/**
 * Main-thread scheduler implementing the latest-target-time protocol with
 * bounded backpressure:
 *
 * - at most ONE request is in flight at any moment;
 * - while a request is in flight only the NEWEST desired absolute simulation
 *   time is remembered (intermediate targets are coalesced away);
 * - every request carries a generation; replies from an older generation
 *   (pre-reset, pre-config-change, pre-quantity-change) are reported stale;
 * - received display buffers can be recycled back to the worker so playback
 *   ping-pongs buffers instead of allocating each frame.
 *
 * The class is deliberately free of Worker/browser dependencies so it can be
 * unit-tested against a fake worker.
 */
export class Quantum2DWorkerScheduler {
  private generation = 0;

  private inFlight = false;

  private desiredTime = 0;

  private lastRequestedTime = -1;

  private recycledBuffers: ArrayBuffer[] = [];

  public constructor(private readonly target: PostMessageTarget) {}

  /** Whether a response belongs to the current (non-stale) generation. */
  public isCurrent(responseGeneration: number): boolean {
    return responseGeneration === this.generation;
  }

  public get currentGeneration(): number {
    return this.generation;
  }

  public get hasRequestInFlight(): boolean {
    return this.inFlight;
  }

  /** Newest absolute simulation time the UI wants displayed. */
  public get newestDesiredTime(): number {
    return this.desiredTime;
  }

  /**
   * Reconfigures the worker (new config, geometry, quantity or reset). Bumps
   * the generation so in-flight results from the old configuration are
   * invalidated immediately.
   */
  public configure(
    geometry: Quantum2DGeometry,
    config: Quantum2DConfig,
    quantity: Quantum2DQuantity,
  ): void {
    this.generation += 1;
    this.desiredTime = 0;
    this.lastRequestedTime = 0;
    this.recycledBuffers = [];
    this.inFlight = true;
    this.target.postMessage({
      type: 'configure',
      generation: this.generation,
      geometry,
      config,
      quantity,
    });
  }

  /** Switches the displayed quantity; invalidates in-flight results. */
  public setQuantity(quantity: Quantum2DQuantity): void {
    this.generation += 1;
    this.inFlight = true;
    // The reply re-renders the current time with the new quantity, after which
    // the pump resumes from the newest desired time.
    this.lastRequestedTime = -1;
    this.target.postMessage({
      type: 'set-quantity',
      generation: this.generation,
      quantity,
    });
  }

  /**
   * Notes the newest desired absolute simulation time and sends it if the
   * worker is idle. While busy, only the newest value is kept.
   */
  public requestTime(time: number): void {
    this.desiredTime = time;
    this.pump();
  }

  /** Hands consumed display buffers back for reuse by the next request. */
  public recycleBuffer(buffer: ArrayBufferLike): void {
    // SharedArrayBuffers cannot be transferred; only recycle plain,
    // non-detached buffers, and keep at most two (value + phase aux).
    if (buffer instanceof ArrayBuffer && buffer.byteLength > 0) {
      this.recycledBuffers = this.recycledBuffers.concat(buffer).slice(-2);
    }
  }

  /**
   * Feeds a worker response into the scheduler. Returns 'stale' when the
   * response belongs to an older generation and must be ignored, 'fresh'
   * otherwise. Optional `recycledBuffers` are stored BEFORE the next request
   * is dispatched, so steady-state playback actually ping-pongs buffers.
   * Automatically dispatches the next coalesced target.
   */
  public handleResponse(
    response: Quantum2DWorkerResponse,
    recycledBuffers?: ArrayBufferLike[],
  ): 'fresh' | 'stale' {
    if (response.generation !== this.generation) {
      return 'stale';
    }

    if (recycledBuffers !== undefined) {
      for (const buffer of recycledBuffers) {
        this.recycleBuffer(buffer);
      }
    }

    this.inFlight = false;
    this.pump();
    return 'fresh';
  }

  private pump(): void {
    if (this.inFlight || this.desiredTime === this.lastRequestedTime) {
      return;
    }

    this.inFlight = true;
    this.lastRequestedTime = this.desiredTime;

    const buffers = this.recycledBuffers;
    this.recycledBuffers = [];
    const message: Quantum2DWorkerRequest = {
      type: 'set-time',
      generation: this.generation,
      targetTime: this.desiredTime,
      ...(buffers.length > 0 ? { recycledBuffers: buffers } : {}),
    };
    this.target.postMessage(message, buffers.length > 0 ? buffers : undefined);
  }
}
