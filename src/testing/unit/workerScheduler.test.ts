import { Quantum2DWorkerScheduler } from '../../app/workers/workerScheduler';
import type {
  Quantum2DWorkerRequest,
  Quantum2DWorkerResponse,
} from '../../app/workers/quantum2DProtocol';
import { defaultQuantum2DTorusConfig } from '../../app/presets/quantum2dTorus';

/**
 * A deliberately slow fake worker: it records every request and only replies
 * when the test explicitly asks it to, simulating a worker that computes far
 * slower than the main thread produces animation frames.
 */
class SlowFakeWorker {
  public readonly requests: Quantum2DWorkerRequest[] = [];

  public postMessage(message: Quantum2DWorkerRequest): void {
    this.requests.push(message);
  }

  public get pendingCount(): number {
    return this.requests.length - this.repliedCount;
  }

  private repliedCount = 0;

  /** Produces the reply for the oldest unanswered request. */
  public replyToNext(): Quantum2DWorkerResponse {
    const request = this.requests[this.repliedCount];
    if (request === undefined) {
      throw new Error('No pending request to reply to.');
    }
    this.repliedCount += 1;

    return {
      type: 'state',
      generation: request.generation,
      snapshot: {
        kind: 'quantum-2d-display',
        sourceKind: 'quantum-2d-periodic',
        time: request.type === 'set-time' ? request.targetTime : 0,
        systemLabel: '2D torus',
        boundaryCondition: 'periodic',
        modeLabel: 'square-root lattice quantum model',
        quantity: 'probability-density',
        width: 8,
        height: 8,
        domainLength: 1,
        spacing: 1 / 8,
        geometry: 'torus-periodic',
        displayValues: new Float32Array(64),
        totalNorm: 1,
      },
      diagnostics: {
        maxStableDt: Number.POSITIVE_INFINITY,
        recommendedDt: 0.05,
        stabilityRatio: 1,
        totalNorm: 1,
        normError: 0,
      },
      timings: { computeMs: 0, snapshotMs: 0 },
    };
  }
}

function createScheduler(): {
  scheduler: Quantum2DWorkerScheduler;
  worker: SlowFakeWorker;
} {
  const worker = new SlowFakeWorker();
  const scheduler = new Quantum2DWorkerScheduler(worker);
  scheduler.configure(
    'torus-periodic',
    defaultQuantum2DTorusConfig,
    'probability-density',
  );
  return { scheduler, worker };
}

describe('Quantum2DWorkerScheduler', () => {
  it('keeps the queue depth bounded at one in-flight request under frame pressure', () => {
    const { scheduler, worker } = createScheduler();
    expect(worker.pendingCount).toBe(1); // the configure request

    // 100 animation frames while the worker never replies.
    for (let frame = 1; frame <= 100; frame += 1) {
      scheduler.requestTime(frame / 60);
    }

    // Nothing beyond the initial configure was sent: targets were coalesced.
    expect(worker.requests).toHaveLength(1);
    expect(worker.pendingCount).toBe(1);
    expect(scheduler.newestDesiredTime).toBeCloseTo(100 / 60, 12);
  });

  it('sends only the newest coalesced target when the worker becomes idle', () => {
    const { scheduler, worker } = createScheduler();

    for (let frame = 1; frame <= 50; frame += 1) {
      scheduler.requestTime(frame / 60);
    }

    expect(scheduler.handleResponse(worker.replyToNext())).toBe('fresh');

    // Exactly one set-time follows, carrying the newest target only.
    expect(worker.requests).toHaveLength(2);
    const setTime = worker.requests[1];
    expect(setTime.type).toBe('set-time');
    if (setTime.type === 'set-time') {
      expect(setTime.targetTime).toBeCloseTo(50 / 60, 12);
    }
  });

  it('does not resend when the desired time has not advanced', () => {
    const { scheduler, worker } = createScheduler();
    scheduler.requestTime(0.5);
    scheduler.handleResponse(worker.replyToNext()); // configure done -> sends 0.5
    scheduler.handleResponse(worker.replyToNext()); // 0.5 done

    expect(worker.requests).toHaveLength(2);

    // Same target again: nothing new is sent (paused UI stays quiet).
    scheduler.requestTime(0.5);
    expect(worker.requests).toHaveLength(2);
  });

  it('rejects stale results after a reconfigure', () => {
    const { scheduler, worker } = createScheduler();
    scheduler.requestTime(1);

    // Reconfigure (reset) while the configure request is still unanswered.
    scheduler.configure(
      'torus-periodic',
      defaultQuantum2DTorusConfig,
      'probability-density',
    );

    // The reply to the first (old-generation) request must be reported stale.
    expect(scheduler.handleResponse(worker.replyToNext())).toBe('stale');
    // The reply to the new configure is fresh.
    expect(scheduler.handleResponse(worker.replyToNext())).toBe('fresh');
  });

  it('rejects stale results after a quantity change', () => {
    const { scheduler, worker } = createScheduler();
    scheduler.requestTime(0.25);

    scheduler.setQuantity('magnitude');

    expect(scheduler.handleResponse(worker.replyToNext())).toBe('stale'); // old configure
    expect(scheduler.handleResponse(worker.replyToNext())).toBe('fresh'); // set-quantity
  });

  it('resumes from the newest desired time after a quantity change', () => {
    const { scheduler, worker } = createScheduler();
    scheduler.handleResponse(worker.replyToNext()); // configure done
    scheduler.requestTime(2);
    scheduler.handleResponse(worker.replyToNext()); // t=2 done

    scheduler.setQuantity('real-part');
    scheduler.requestTime(2.5);
    scheduler.handleResponse(worker.replyToNext()); // set-quantity done

    const last = worker.requests[worker.requests.length - 1];
    expect(last.type).toBe('set-time');
    if (last.type === 'set-time') {
      expect(last.targetTime).toBe(2.5);
      expect(last.generation).toBe(scheduler.currentGeneration);
    }
  });

  it('a reset invalidates pending work immediately (desired time returns to zero)', () => {
    const { scheduler, worker } = createScheduler();
    scheduler.requestTime(42);
    scheduler.configure(
      'torus-periodic',
      defaultQuantum2DTorusConfig,
      'probability-density',
    );

    expect(scheduler.newestDesiredTime).toBe(0);

    // Old replies are dropped; after the fresh configure reply, no set-time is
    // sent because the desired time (0) matches the configured time.
    scheduler.handleResponse(worker.replyToNext());
    scheduler.handleResponse(worker.replyToNext());
    expect(
      worker.requests.filter((request) => request.type === 'set-time'),
    ).toHaveLength(0);
  });

  it('pause and resume produce no time drift (only explicit targets are sent)', () => {
    const { scheduler, worker } = createScheduler();
    scheduler.handleResponse(worker.replyToNext()); // configure done

    scheduler.requestTime(1.0);
    scheduler.handleResponse(worker.replyToNext());

    // Paused: no requestTime calls occur. The scheduler stays silent.
    const requestsWhilePaused = worker.requests.length;
    expect(worker.pendingCount).toBe(0);
    expect(worker.requests.length).toBe(requestsWhilePaused);

    // Resume continues from the exact paused time plus the new increment.
    scheduler.requestTime(1.0 + 0.016);
    const last = worker.requests[worker.requests.length - 1];
    expect(last.type).toBe('set-time');
    if (last.type === 'set-time') {
      expect(last.targetTime).toBeCloseTo(1.016, 12);
    }
  });

  it('recycles display buffers into subsequent set-time requests', () => {
    const { scheduler, worker } = createScheduler();
    scheduler.handleResponse(worker.replyToNext()); // configure done

    const buffer = new ArrayBuffer(64 * 4);
    scheduler.recycleBuffer(buffer);
    scheduler.requestTime(0.1);

    const last = worker.requests[worker.requests.length - 1];
    expect(last.type).toBe('set-time');
    if (last.type === 'set-time') {
      expect(last.recycledBuffers).toContain(buffer);
    }
  });

  it('buffers recycled inside handleResponse ride along with the immediately pumped request', () => {
    const { scheduler, worker } = createScheduler();
    scheduler.handleResponse(worker.replyToNext()); // configure done

    scheduler.requestTime(0.1); // dispatched immediately (no recycled buffer yet)
    const primary = new ArrayBuffer(64 * 4);
    const aux = new ArrayBuffer(64 * 4);
    // A newer target arrives while t=0.1 is in flight.
    scheduler.requestTime(0.2);
    // The reply hands back the superseded frame's buffers BEFORE the pump.
    scheduler.handleResponse(worker.replyToNext(), [primary, aux]);

    const last = worker.requests[worker.requests.length - 1];
    expect(last.type).toBe('set-time');
    if (last.type === 'set-time') {
      expect(last.targetTime).toBeCloseTo(0.2, 12);
      expect(last.recycledBuffers).toContain(primary);
      expect(last.recycledBuffers).toContain(aux);
    }
  });
});
