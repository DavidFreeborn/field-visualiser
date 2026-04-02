import { advanceSimulationClock, MAX_FRAME_CATCH_UP_SECONDS } from '../../app/state/simulationClock';
import type { Classical1DPeriodicDiagnostics } from '../../physics/classical/classical1dPeriodic';

class FakeEngine {
  public readonly steps: number[] = [];

  public getDiagnostics(): Classical1DPeriodicDiagnostics {
    return {
      maxStableDt: 0.02,
      recommendedDt: 0.01,
      stabilityRatio: 0.5,
      totalEnergy: 1,
      relativeEnergyDrift: 0,
    };
  }

  public step(dt: number): void {
    this.steps.push(dt);
  }
}

describe('advanceSimulationClock', () => {
  it('consumes delayed frame time in repeated stable substeps', () => {
    const engine = new FakeEngine();

    const result = advanceSimulationClock(engine, 0.055, 1, 0);

    expect(engine.steps).toEqual([0.01, 0.01, 0.01, 0.01, 0.01]);
    expect(result.simulatedSeconds).toBeCloseTo(0.05, 8);
    expect(result.carrySeconds).toBeCloseTo(0.005, 8);
  });

  it('caps catch-up time per frame to avoid unbounded bursts', () => {
    const engine = new FakeEngine();

    const result = advanceSimulationClock(engine, 2, 1, 0);

    expect(result.simulatedSeconds).toBeLessThanOrEqual(MAX_FRAME_CATCH_UP_SECONDS);
    expect(engine.steps.length).toBeGreaterThan(0);
  });
});
