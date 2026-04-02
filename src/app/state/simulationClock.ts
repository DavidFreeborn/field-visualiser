export interface StepLikeEngine {
  step(dt: number): void;
  getDiagnostics(): {
    readonly recommendedDt: number;
  };
}

export interface SimulationClockState {
  readonly carrySeconds: number;
  readonly simulatedSeconds: number;
  readonly consumedSubsteps: number;
}

export const MAX_FRAME_CATCH_UP_SECONDS = 0.25;
export const MAX_SUBSTEPS_PER_FRAME = 12;

export function advanceSimulationClock(
  engine: StepLikeEngine,
  elapsedSeconds: number,
  speed: number,
  previousCarrySeconds: number,
): SimulationClockState {
  const boundedElapsedSeconds = Math.min(elapsedSeconds, MAX_FRAME_CATCH_UP_SECONDS);
  let carrySeconds = previousCarrySeconds + boundedElapsedSeconds * speed;
  let simulatedSeconds = 0;
  let consumedSubsteps = 0;

  const recommendedDt = engine.getDiagnostics().recommendedDt;

  while (carrySeconds >= recommendedDt && consumedSubsteps < MAX_SUBSTEPS_PER_FRAME) {
    engine.step(recommendedDt);
    carrySeconds -= recommendedDt;
    simulatedSeconds += recommendedDt;
    consumedSubsteps += 1;
  }

  return {
    carrySeconds,
    simulatedSeconds,
    consumedSubsteps,
  };
}
