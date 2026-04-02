import {
  Classical1DPeriodicEngine,
  type Classical1DPeriodicConfig,
} from '../../physics/classical/classical1dPeriodic';

const baseConfig: Classical1DPeriodicConfig = {
  siteCount: 128,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.5,
  gaussianWidth: 0.06,
  initialPreset: 'standing-mode-2',
};

describe('Classical1DPeriodicEngine', () => {
  it('preserves the zero state exactly', () => {
    const engine = new Classical1DPeriodicEngine({
      ...baseConfig,
      amplitude: 0,
      initialPreset: 'gaussian-displacement',
    });

    engine.step(0.2);
    const snapshot = engine.getSnapshot();

    expect(Array.from(snapshot.displacement)).toEqual(
      Array.from({ length: baseConfig.siteCount }, () => 0),
    );
    expect(Array.from(snapshot.velocity)).toEqual(
      Array.from({ length: baseConfig.siteCount }, () => 0),
    );
  });

  it('keeps energy drift below tolerance over a long conservative run', () => {
    const engine = new Classical1DPeriodicEngine(baseConfig);
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 1_500; index += 1) {
      engine.step(dt);
    }

    expect(engine.getDiagnostics().relativeEnergyDrift).toBeLessThan(5e-4);
  });

  it('keeps integrated standing-mode energy consistent across resolutions', () => {
    const coarseEngine = new Classical1DPeriodicEngine({
      ...baseConfig,
      siteCount: 64,
    });
    const fineEngine = new Classical1DPeriodicEngine({
      ...baseConfig,
      siteCount: 256,
    });

    const coarseEnergy = coarseEngine.getSnapshot().totalEnergy;
    const fineEnergy = fineEngine.getSnapshot().totalEnergy;

    expect(coarseEnergy).toBeCloseTo(fineEnergy, 1);
    expect(fineEnergy).toBeCloseTo(Math.PI ** 2, 1);
  });
});
