import {
  Quantum1DFixedEngine,
  type Quantum1DFixedConfig,
} from '../../physics/quantum/quantum1dFixed';

const baseConfig: Quantum1DFixedConfig = {
  siteCount: 129,
  waveSpeed: 1,
  domainLength: 1,
  initialCenter: 0.5,
  gaussianWidth: 0.08,
  momentumWidth: 2,
  modeNumber: 4,
  initialPreset: 'gaussian-wavepacket',
};

describe('Quantum1DFixedEngine', () => {
  it('conserves norm for the fixed-end one-particle evolution', () => {
    const engine = new Quantum1DFixedEngine(baseConfig);
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 2_000; index += 1) {
      engine.step(dt);
    }

    const snapshot = engine.getSnapshot();
    expect(engine.getDiagnostics().normError).toBeLessThan(1e-10);
    expect(snapshot.probabilityDensity[0]).toBeCloseTo(0, 12);
    expect(snapshot.probabilityDensity[snapshot.probabilityDensity.length - 1]).toBeCloseTo(0, 12);
  });

  it('evolves a selected sine mode by phase only while keeping probability density fixed', () => {
    const modeNumber = 5;
    const engine = new Quantum1DFixedEngine({
      ...baseConfig,
      initialPreset: 'selected-normal-mode',
      modeNumber,
    });

    const initialSnapshot = engine.getSnapshot('real-part');
    const dt = 0.173;
    const spacing = initialSnapshot.spacing;
    const interiorCount = baseConfig.siteCount - 2;
    const angularFrequency =
      (2 * baseConfig.waveSpeed * Math.sin((Math.PI * modeNumber) / (2 * (interiorCount + 1)))) /
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

  it('matches the locked baseline for a representative fixed-end one-particle evolution', () => {
    const engine = new Quantum1DFixedEngine(baseConfig);
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 20; index += 1) {
      engine.step(dt);
    }

    const snapshot = engine.getSnapshot();
    const diagnostics = engine.getDiagnostics();

    expect(snapshot.time).toBeCloseTo(0.02045461736687728, 12);
    expect(snapshot.probabilityDensity[1]).toBeCloseTo(2.629490886900237e-9, 12);
    expect(snapshot.probabilityDensity[32]).toBeCloseTo(0.0000063527300083002975, 12);
    expect(snapshot.probabilityDensity[64]).toBeCloseTo(0.05289070341576378, 12);
    expect(snapshot.amplitudeReal[32]).toBeCloseTo(0.0017328455489409812, 12);
    expect(snapshot.amplitudeImaginary[32]).toBeCloseTo(0.001830294050642062, 12);
    expect(snapshot.totalNorm).toBeCloseTo(1, 12);
    expect(diagnostics.normError).toBeLessThan(1e-12);
  });
});
