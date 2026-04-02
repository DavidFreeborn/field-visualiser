import {
  Quantum1DPeriodicEngine,
  type Quantum1DPeriodicConfig,
} from '../../physics/quantum/quantum1dPeriodic';

const baseConfig: Quantum1DPeriodicConfig = {
  siteCount: 128,
  waveSpeed: 1,
  domainLength: 1,
  gaussianWidth: 0.08,
  momentumWidth: 2,
  modeNumber: 6,
  initialPreset: 'gaussian-wavepacket',
};

describe('Quantum1DPeriodicEngine', () => {
  it('conserves norm over long exact evolution', () => {
    const engine = new Quantum1DPeriodicEngine(baseConfig);
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 2_000; index += 1) {
      engine.step(dt);
    }

    expect(engine.getDiagnostics().normError).toBeLessThan(1e-10);
  });

  it('keeps probability density non-negative and normalized', () => {
    const engine = new Quantum1DPeriodicEngine({
      ...baseConfig,
      initialPreset: 'site-localized',
    });
    const snapshot = engine.getSnapshot();

    for (const value of snapshot.probabilityDensity) {
      expect(value).toBeGreaterThanOrEqual(0);
    }

    expect(snapshot.totalNorm).toBeCloseTo(1, 12);
  });

  it('evolves a selected normal mode by phase only', () => {
    const modeNumber = 5;
    const engine = new Quantum1DPeriodicEngine({
      ...baseConfig,
      initialPreset: 'selected-normal-mode',
      modeNumber,
    });

    const initialSnapshot = engine.getSnapshot('real-part');
    const dt = 0.137;
    const spacing = initialSnapshot.spacing;
    const angularFrequency =
      (2 * baseConfig.waveSpeed * Math.sin((Math.PI * modeNumber) / baseConfig.siteCount)) /
      spacing;

    engine.step(dt);
    const finalSnapshot = engine.getSnapshot('real-part');

    const expectedPhase = -angularFrequency * dt;
    const cosPhase = Math.cos(expectedPhase);
    const sinPhase = Math.sin(expectedPhase);

    for (let index = 0; index < initialSnapshot.amplitudeReal.length; index += 1) {
      const expectedReal =
        initialSnapshot.amplitudeReal[index] * cosPhase -
        initialSnapshot.amplitudeImaginary[index] * sinPhase;
      const expectedImaginary =
        initialSnapshot.amplitudeReal[index] * sinPhase +
        initialSnapshot.amplitudeImaginary[index] * cosPhase;

      expect(finalSnapshot.amplitudeReal[index]).toBeCloseTo(expectedReal, 10);
      expect(finalSnapshot.amplitudeImaginary[index]).toBeCloseTo(expectedImaginary, 10);
      expect(finalSnapshot.probabilityDensity[index]).toBeCloseTo(
        initialSnapshot.probabilityDensity[index],
        10,
      );
    }
  });
});
