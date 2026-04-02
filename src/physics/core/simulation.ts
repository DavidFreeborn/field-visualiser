export interface SimulationDiagnostics {
  readonly maxStableDt: number;
  readonly recommendedDt: number;
  readonly stabilityRatio: number;
}

export interface SimulationEngine<Config, Snapshot, Diagnostics extends SimulationDiagnostics> {
  reset(config: Config): void;
  step(dt: number): void;
  getSnapshot(): Snapshot;
  getDiagnostics(): Diagnostics;
}
