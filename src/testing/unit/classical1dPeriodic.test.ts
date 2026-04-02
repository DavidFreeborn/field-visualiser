import {
  Classical1DPeriodicEngine,
  type Classical1DPeriodicConfig,
} from '../../physics/classical/classical1dPeriodic';

const baseConfig: Classical1DPeriodicConfig = {
  siteCount: 128,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.5,
  initialCenter: 0.5,
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

  it('matches the analytical standing-mode period for the discrete periodic lattice', () => {
    const modeNumber = 2;
    const engine = new Classical1DPeriodicEngine({
      ...baseConfig,
      siteCount: 128,
      initialPreset: 'standing-mode-2',
    });

    const initialSnapshot = engine.getSnapshot();
    const dt = engine.getDiagnostics().recommendedDt;
    const spacing = initialSnapshot.spacing;
    const angularFrequency =
      (2 * baseConfig.waveSpeed * Math.sin((Math.PI * modeNumber) / baseConfig.siteCount)) /
      spacing;
    const period = (2 * Math.PI) / angularFrequency;
    const steps = Math.round(period / dt);

    for (let index = 0; index < steps; index += 1) {
      engine.step(dt);
    }

    const finalSnapshot = engine.getSnapshot();

    expect(finalSnapshot.time).toBeCloseTo(period, 2);

    for (let index = 0; index < finalSnapshot.displacement.length; index += 1) {
      expect(finalSnapshot.displacement[index]).toBeCloseTo(
        initialSnapshot.displacement[index],
        2,
      );
    }
  });

  it('matches the locked baseline for a representative classical evolution', () => {
    const engine = new Classical1DPeriodicEngine({
      siteCount: 64,
      waveSpeed: 1,
      domainLength: 1,
      amplitude: 0.75,
      initialCenter: 0.5,
      gaussianWidth: 0.06,
      initialPreset: 'gaussian-displacement',
    });
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 24; index += 1) {
      engine.step(dt);
    }

    const snapshot = engine.getSnapshot();
    const diagnostics = engine.getDiagnostics();

    expect(snapshot.time).toBeCloseTo(0.2624999999999999, 12);
    expect(snapshot.displacement[0]).toBeCloseTo(0.00039356191408587406, 12);
    expect(snapshot.displacement[16]).toBeCloseTo(0.3682931564710563, 12);
    expect(snapshot.displacement[32]).toBeCloseTo(0.00003224871391385605, 12);
    expect(snapshot.displacement[48]).toBeCloseTo(0.36829315647105626, 12);
    expect(snapshot.velocity[0]).toBeCloseTo(0.026391398073355245, 12);
    expect(snapshot.velocity[16]).toBeCloseTo(-1.1423663379548255, 12);
    expect(snapshot.velocity[32]).toBeCloseTo(-0.002910375785966271, 12);
    expect(snapshot.velocity[48]).toBeCloseTo(-1.1423663379548268, 12);
    expect(snapshot.totalEnergy).toBeCloseTo(4.094008319486946, 12);
    expect(diagnostics.relativeEnergyDrift).toBeCloseTo(0.006108771248696588, 12);
  });
});
