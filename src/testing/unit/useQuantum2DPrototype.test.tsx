import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuantum2DPrototype } from '../../app/state/useQuantum2DPrototype';
import type { Quantum2DWorkerResponse } from '../../app/workers/quantum2DProtocol';

const workerMessages: unknown[] = [];
const terminateSpy = vi.fn();

class MockWorker {
  public onmessage:
    | ((event: MessageEvent<Quantum2DWorkerResponse>) => void)
    | null = null;

  public onerror: ((event: Event) => void) | null = null;

  public postMessage(message: unknown): void {
    workerMessages.push(message);

    const request = message as {
      type?: string;
      quantity?: string;
      generation?: number;
    };
    if (
      request.type === 'configure' ||
      request.type === 'set-quantity' ||
      request.type === 'set-time'
    ) {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'state',
            generation: request.generation ?? 0,
            snapshot: {
              kind: 'quantum-2d-display',
              sourceKind: 'quantum-2d-periodic',
              time: 0,
              systemLabel: '2D torus',
              boundaryCondition: 'periodic',
              modeLabel: 'square-root lattice quantum model',
              quantity: (request.quantity ?? 'probability-density') as
                | 'probability-density'
                | 'real-part',
              width: 4,
              height: 4,
              domainLength: 1,
              spacing: 0.25,
              geometry: 'torus-periodic',
              displayValues: new Float32Array(16),
              totalNorm: 1,
            },
            diagnostics: {
              maxStableDt: Number.POSITIVE_INFINITY,
              recommendedDt: 0.01,
              stabilityRatio: 1,
              totalNorm: 1,
              normError: 0,
            },
            timings: { computeMs: 0, snapshotMs: 0 },
          },
        } as MessageEvent<Quantum2DWorkerResponse>);
      });
    }
  }

  public terminate(): void {
    terminateSpy();
  }
}

describe('useQuantum2DPrototype', () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    workerMessages.length = 0;
    terminateSpy.mockClear();
    globalThis.Worker = MockWorker as unknown as typeof Worker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it('uses the worker path for 2D quantum state updates when workers are available', async () => {
    const user = userEvent.setup();

    function Probe(): React.JSX.Element {
      const controller = useQuantum2DPrototype('torus-periodic');

      useEffect(() => {
        controller.setPlaying(false);
      }, [controller]);

      return (
        <div>
          <div data-testid="quantity">{controller.snapshot.quantity}</div>
          <button
            type="button"
            onClick={() => controller.setQuantity('real-part')}
          >
            real-part
          </button>
        </div>
      );
    }

    render(<Probe />);

    await waitFor(() => {
      expect(workerMessages[0]).toMatchObject({
        type: 'configure',
        geometry: 'torus-periodic',
      });
    });

    await user.click(screen.getByRole('button', { name: 'real-part' }));

    await waitFor(() => {
      expect(screen.getByTestId('quantity')).toHaveTextContent('real-part');
    });

    expect(workerMessages).toContainEqual(
      expect.objectContaining({
        type: 'set-quantity',
        quantity: 'real-part',
      }),
    );
  });

  it('reconfigures the existing worker on config changes instead of restarting it', async () => {
    const user = userEvent.setup();

    function Probe(): React.JSX.Element {
      const controller = useQuantum2DPrototype('torus-periodic');

      useEffect(() => {
        controller.setPlaying(false);
      }, [controller]);

      return (
        <div>
          <div data-testid="size">{controller.config.size}</div>
          <button
            type="button"
            onClick={() =>
              controller.setConfig({ ...controller.config, size: 48 })
            }
          >
            resize
          </button>
        </div>
      );
    }

    render(<Probe />);

    await waitFor(() => {
      expect(
        workerMessages.some(
          (m) => (m as { type?: string }).type === 'configure',
        ),
      ).toBe(true);
    });
    const terminationsAfterMount = terminateSpy.mock.calls.length;
    const configuresBefore = workerMessages.filter(
      (m) => (m as { type?: string }).type === 'configure',
    ).length;

    await user.click(screen.getByRole('button', { name: 'resize' }));

    await waitFor(() => {
      const configuresAfter = workerMessages.filter(
        (m) => (m as { type?: string }).type === 'configure',
      ).length;
      expect(configuresAfter).toBe(configuresBefore + 1);
    });

    // No worker teardown happened for the config change.
    expect(terminateSpy.mock.calls.length).toBe(terminationsAfterMount);
    expect(screen.getByTestId('size')).toHaveTextContent('48');
  });

  it('reset publishes a fresh time-zero frame immediately, without waiting for the worker', async () => {
    // A worker that never replies: any frame that appears must come from the
    // hook's own local time-zero publication.
    class SilentWorker {
      public onmessage:
        | ((event: MessageEvent<Quantum2DWorkerResponse>) => void)
        | null = null;
      public onerror: ((event: Event) => void) | null = null;
      public postMessage(message: unknown): void {
        workerMessages.push(message);
      }
      public terminate(): void {
        terminateSpy();
      }
    }
    globalThis.Worker = SilentWorker as unknown as typeof Worker;

    const user = userEvent.setup();
    let latestChannelTime: number | null = null;

    function Probe(): React.JSX.Element {
      const controller = useQuantum2DPrototype('torus-periodic');

      useEffect(() => {
        controller.setPlaying(false);
      }, [controller]);

      return (
        <div>
          <div data-testid="displayTime">{controller.displayTime}</div>
          <button
            type="button"
            onClick={() => {
              controller.reset();
              latestChannelTime =
                controller.frameChannel.getLatest()?.time ?? null;
            }}
          >
            reset
          </button>
        </div>
      );
    }

    render(<Probe />);
    await user.click(screen.getByRole('button', { name: 'reset' }));

    // The frame channel already carries a genuine time-zero frame even though
    // the worker has not answered.
    expect(latestChannelTime).toBe(0);
    expect(screen.getByTestId('displayTime')).toHaveTextContent('0');
  });

  it('ignores stale worker error responses from a superseded generation', async () => {
    let workerInstance: MockWorker | null = null;
    class CapturingWorker extends MockWorker {
      public constructor() {
        super();
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        workerInstance = this;
      }
    }
    globalThis.Worker = CapturingWorker as unknown as typeof Worker;

    const user = userEvent.setup();

    function Probe(): React.JSX.Element {
      const controller = useQuantum2DPrototype('torus-periodic');

      useEffect(() => {
        controller.setPlaying(false);
      }, [controller]);

      return (
        <button type="button" onClick={() => controller.reset()}>
          reset
        </button>
      );
    }

    render(<Probe />);
    await waitFor(() => {
      expect(
        workerMessages.some(
          (m) => (m as { type?: string }).type === 'configure',
        ),
      ).toBe(true);
    });

    // Bump the generation, then deliver an error stamped with a stale one.
    await user.click(screen.getByRole('button', { name: 'reset' }));
    const terminationsBefore = terminateSpy.mock.calls.length;
    workerInstance!.onmessage?.({
      data: { type: 'error', generation: 0, message: 'stale failure' },
    } as MessageEvent<Quantum2DWorkerResponse>);

    // The healthy worker was not torn down (no local-mode fallback).
    expect(terminateSpy.mock.calls.length).toBe(terminationsBefore);
  });
});
