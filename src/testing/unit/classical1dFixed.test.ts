import {
  Classical1DFixedEngine,
  type Classical1DFixedConfig,
} from '../../physics/classical/classical1dFixed';

const baseConfig: Classical1DFixedConfig = {
  siteCount: 129,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.75,
  initialCenter: 0.5,
  gaussianWidth: 0.06,
  modeNumbers: [1],
  initialPreset: 'gaussian-displacement',
};

describe('Classical1DFixedEngine', () => {
  it('keeps fixed endpoints clamped to zero', () => {
    const engine = new Classical1DFixedEngine({
      ...baseConfig,
      initialCenter: 0.18,
    });
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 200; index += 1) {
      engine.step(dt);
    }

    const snapshot = engine.getSnapshot();
    expect(snapshot.displacement[0]).toBeCloseTo(0, 12);
    expect(snapshot.displacement[snapshot.displacement.length - 1]).toBeCloseTo(
      0,
      12,
    );
    expect(snapshot.velocity[0]).toBeCloseTo(0, 12);
    expect(snapshot.velocity[snapshot.velocity.length - 1]).toBeCloseTo(0, 12);
  });

  it('reflects a pulse from the fixed end with inversion in displacement', () => {
    const engine = new Classical1DFixedEngine({
      ...baseConfig,
      initialCenter: 0.14,
      initialPreset: 'gaussian-displacement',
      amplitude: 0.9,
    });
    const dt = engine.getDiagnostics().recommendedDt;
    let reflectedMinimum = 0;

    for (let index = 0; index < 240; index += 1) {
      engine.step(dt);
      const snapshot = engine.getSnapshot();
      reflectedMinimum = Math.min(reflectedMinimum, snapshot.displacement[18]);
    }

    expect(reflectedMinimum).toBeLessThan(-0.05);
  });

  it('matches the analytical standing mode for fixed boundaries', () => {
    const engine = new Classical1DFixedEngine({
      ...baseConfig,
      initialPreset: 'standing-modes',
      modeNumbers: [1],
      amplitude: 0.5,
    });
    const initialSnapshot = engine.getSnapshot();
    const dt = engine.getDiagnostics().recommendedDt;
    const interiorCount = baseConfig.siteCount - 2;
    const spacing = initialSnapshot.spacing;
    const angularFrequency =
      (2 *
        baseConfig.waveSpeed *
        Math.sin(Math.PI / (2 * (interiorCount + 1)))) /
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

  it('matches the locked baseline for a representative fixed-end classical evolution', () => {
    const engine = new Classical1DFixedEngine(baseConfig);
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 24; index += 1) {
      engine.step(dt);
    }

    const snapshot = engine.getSnapshot();
    const diagnostics = engine.getDiagnostics();

    // Baseline re-locked after the coordinate-convention correction: the
    // fixed-interval Gaussian now samples the full physical grid x_j=j/(N-1)
    // with an unwrapped distance. A centred bump therefore evolves exactly
    // symmetrically (displacement[16] === displacement[112]); the previous
    // baseline was asymmetric because the bump was sampled on the periodic
    // grid convention.
    expect(snapshot.time).toBeCloseTo(0.13124999999999995, 12);
    expect(snapshot.displacement[16]).toBeCloseTo(0.00010201516226432243, 12);
    expect(snapshot.displacement[64]).toBeCloseTo(0.06833278471836242, 12);
    expect(snapshot.displacement[112]).toBeCloseTo(0.00010201516226432244, 12);
    expect(snapshot.velocity[16]).toBeCloseTo(0.007006855085944003, 12);
    expect(snapshot.velocity[64]).toBeCloseTo(-2.509371277619894, 12);
    expect(snapshot.totalEnergy).toBeCloseTo(4.139644078450642, 12);
    expect(diagnostics.relativeEnergyDrift).toBeCloseTo(
      0.0013878492503075497,
      12,
    );
  });
});
