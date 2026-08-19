import {
  Quantum1DPeriodicEngine,
  type Quantum1DPeriodicConfig,
} from '../../physics/quantum/quantum1dPeriodic';
import {
  Quantum1DFixedEngine,
  type Quantum1DFixedConfig,
} from '../../physics/quantum/quantum1dFixed';

const periodicConfig: Quantum1DPeriodicConfig = {
  siteCount: 96,
  waveSpeed: 1,
  domainLength: 1,
  initialCenter: 0.5,
  gaussianWidth: 0.08,
  momentumWidth: 2,
  modeNumber: 4,
  initialPreset: 'gaussian-wavepacket',
};

const fixedConfig: Quantum1DFixedConfig = {
  siteCount: 97,
  waveSpeed: 1,
  domainLength: 1,
  initialCenter: 0.5,
  gaussianWidth: 0.08,
  momentumWidth: 2,
  modeNumber: 4,
  initialPreset: 'gaussian-wavepacket',
};

// Absolute-time evolution is analytic, so composed evolution must agree with a
// direct jump to the same absolute time to floating-point rounding levels.
const COMPOSITION_TOLERANCE = 1e-12;

function maxAbsoluteDifference(a: Float64Array, b: Float64Array): number {
  let maxDifference = 0;
  for (let index = 0; index < a.length; index += 1) {
    maxDifference = Math.max(maxDifference, Math.abs(a[index] - b[index]));
  }
  return maxDifference;
}

describe('Quantum1DPeriodicEngine.setTime', () => {
  it('setTime(t1 + t2) agrees with sequential evolution to the same absolute time', () => {
    const sequential = new Quantum1DPeriodicEngine(periodicConfig);
    const direct = new Quantum1DPeriodicEngine(periodicConfig);

    sequential.setTime(0.37);
    sequential.setTime(0.37 + 0.58);
    direct.setTime(0.95);

    const sequentialSnapshot = sequential.getSnapshot();
    const directSnapshot = direct.getSnapshot();

    expect(
      maxAbsoluteDifference(sequentialSnapshot.amplitudeReal, directSnapshot.amplitudeReal),
    ).toBeLessThan(COMPOSITION_TOLERANCE);
    expect(
      maxAbsoluteDifference(
        sequentialSnapshot.amplitudeImaginary,
        directSnapshot.amplitudeImaginary,
      ),
    ).toBeLessThan(COMPOSITION_TOLERANCE);
  });

  it('repeated step() calls agree with a single setTime to the accumulated time', () => {
    const stepped = new Quantum1DPeriodicEngine(periodicConfig);
    const direct = new Quantum1DPeriodicEngine(periodicConfig);

    const dt = 0.01;
    const steps = 50;
    for (let index = 0; index < steps; index += 1) {
      stepped.step(dt);
    }
    direct.setTime(dt * steps);

    const steppedSnapshot = stepped.getSnapshot();
    const directSnapshot = direct.getSnapshot();

    // step() accumulates absolute time in floating point, so allow slightly
    // more slack than the pure composition test.
    expect(
      maxAbsoluteDifference(steppedSnapshot.amplitudeReal, directSnapshot.amplitudeReal),
    ).toBeLessThan(1e-9);
  });

  it('performs exactly one inverse transform per setTime call, independent of the jump size', () => {
    const engine = new Quantum1DPeriodicEngine(periodicConfig);
    const baseline = engine.inverseTransformCount;

    engine.setTime(0.001);
    expect(engine.inverseTransformCount).toBe(baseline + 1);

    // A huge jump (many multiples of any recommendedDt) is still one transform.
    engine.setTime(1000);
    expect(engine.inverseTransformCount).toBe(baseline + 2);
  });

  it('setTime is idempotent for the same absolute time (pause/resume freeze)', () => {
    const engine = new Quantum1DPeriodicEngine(periodicConfig);
    engine.setTime(0.42);
    const first = engine.getSnapshot();
    const firstReal = first.amplitudeReal.slice();

    engine.setTime(0.42);
    const second = engine.getSnapshot();

    expect(maxAbsoluteDifference(second.amplitudeReal, firstReal)).toBe(0);
    expect(second.time).toBe(first.time);
  });

  it('conserves the norm exactly across large absolute jumps', () => {
    const engine = new Quantum1DPeriodicEngine(periodicConfig);
    engine.setTime(12345.678);
    expect(engine.getDiagnostics().normError).toBeLessThan(1e-10);
  });

  it('reuses double-buffered snapshot arrays (no steady-state typed-array allocation)', () => {
    const engine = new Quantum1DPeriodicEngine(periodicConfig);

    const first = engine.getSnapshot();
    const second = engine.getSnapshot();
    const third = engine.getSnapshot();
    const fourth = engine.getSnapshot();

    // Consecutive snapshots alternate between exactly two persistent buffer
    // sets: a held frame is never mutated, and no new arrays are created.
    expect(third.amplitudeReal).toBe(first.amplitudeReal);
    expect(fourth.amplitudeReal).toBe(second.amplitudeReal);
    expect(second.amplitudeReal).not.toBe(first.amplitudeReal);
  });
});

describe('Quantum1DFixedEngine.setTime', () => {
  it('setTime(t1 + t2) agrees with sequential evolution to the same absolute time', () => {
    const sequential = new Quantum1DFixedEngine(fixedConfig);
    const direct = new Quantum1DFixedEngine(fixedConfig);

    sequential.setTime(0.21);
    sequential.setTime(0.21 + 0.44);
    direct.setTime(0.65);

    const sequentialSnapshot = sequential.getSnapshot();
    const directSnapshot = direct.getSnapshot();

    expect(
      maxAbsoluteDifference(sequentialSnapshot.amplitudeReal, directSnapshot.amplitudeReal),
    ).toBeLessThan(COMPOSITION_TOLERANCE);
    expect(
      maxAbsoluteDifference(
        sequentialSnapshot.amplitudeImaginary,
        directSnapshot.amplitudeImaginary,
      ),
    ).toBeLessThan(COMPOSITION_TOLERANCE);
  });

  it('performs exactly one inverse transform per setTime call', () => {
    const engine = new Quantum1DFixedEngine(fixedConfig);
    const baseline = engine.inverseTransformCount;

    engine.setTime(0.5);
    expect(engine.inverseTransformCount).toBe(baseline + 1);
    engine.setTime(500);
    expect(engine.inverseTransformCount).toBe(baseline + 2);
  });

  it('keeps the boundary sites pinned to zero at all times', () => {
    const engine = new Quantum1DFixedEngine(fixedConfig);
    engine.setTime(3.21);
    const snapshot = engine.getSnapshot();

    expect(snapshot.amplitudeReal[0]).toBe(0);
    expect(snapshot.amplitudeImaginary[0]).toBe(0);
    expect(snapshot.amplitudeReal[snapshot.siteCount - 1]).toBe(0);
    expect(snapshot.amplitudeImaginary[snapshot.siteCount - 1]).toBe(0);
  });

  it('conserves the norm across large absolute jumps', () => {
    const engine = new Quantum1DFixedEngine(fixedConfig);
    engine.setTime(9876.5);
    expect(engine.getDiagnostics().normError).toBeLessThan(1e-10);
  });
});
