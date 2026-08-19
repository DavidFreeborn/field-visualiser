import { render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { vi } from 'vitest';
import { usePeriodicQuantumPrototype } from '../../app/state/usePeriodicQuantumPrototype';
import { Quantum1DPeriodicEngine } from '../../physics/quantum/quantum1dPeriodic';

// Wrap the real engine class so the test can observe the instances the hook
// creates internally.
const engineInstances: Quantum1DPeriodicEngine[] = [];

vi.mock('../../physics/quantum/quantum1dPeriodic', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../physics/quantum/quantum1dPeriodic')
  >();

  class InstrumentedEngine extends actual.Quantum1DPeriodicEngine {
    public constructor(...args: ConstructorParameters<typeof actual.Quantum1DPeriodicEngine>) {
      super(...args);
      engineInstances.push(this);
    }
  }

  return { ...actual, Quantum1DPeriodicEngine: InstrumentedEngine };
});

describe('quantum hook animation instrumentation', () => {
  it('performs at most one inverse transform per animation update', async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    function Probe(): React.JSX.Element {
      const controller = usePeriodicQuantumPrototype(true);
      useEffect(() => {
        // Keep playing (default true).
        void controller;
      }, [controller]);
      return <div />;
    }

    const { unmount } = render(<Probe />);

    await waitFor(() => {
      expect(engineInstances.length).toBeGreaterThan(0);
      expect(frameCallbacks.length).toBeGreaterThan(0);
    });

    const engine = engineInstances[engineInstances.length - 1];

    // Prime the loop clock with a first frame.
    frameCallbacks[frameCallbacks.length - 1](1000);

    // Each subsequent animation update must cost at most ONE inverse
    // transform, even for a long frame gap (which would previously trigger up
    // to 12 CFL-style substeps, each with its own inverse transform).
    const scenarios = [16.7, 16.7, 250, 33.4, 1000];
    let timestamp = 1000;
    for (const frameGapMs of scenarios) {
      timestamp += frameGapMs;
      const before = engine.inverseTransformCount;
      frameCallbacks[frameCallbacks.length - 1](timestamp);
      const after = engine.inverseTransformCount;
      expect(after - before).toBeLessThanOrEqual(1);
    }

    unmount();
    vi.unstubAllGlobals();
  });
});
