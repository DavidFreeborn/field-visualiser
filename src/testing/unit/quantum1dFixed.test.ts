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
});
