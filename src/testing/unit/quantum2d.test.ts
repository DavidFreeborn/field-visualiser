import {
  Quantum2DPeriodicEngine,
  type Quantum2DPeriodicConfig,
} from '../../physics/quantum/quantum2dPeriodic';
import {
  Quantum2DFixedEngine,
  type Quantum2DFixedConfig,
} from '../../physics/quantum/quantum2dFixed';
import { flattenIndex2D } from '../../physics/core/grids';

const torusConfig: Quantum2DPeriodicConfig = {
  size: 16,
  waveSpeed: 1,
  domainLength: 1,
  initialCenterX: 0.5,
  initialCenterY: 0.5,
  gaussianWidth: 0.12,
  momentumWidth: 1.2,
  modeNumberX: 3,
  modeNumberY: 0,
  initialPreset: 'gaussian-wavepacket',
};

const squareConfig: Quantum2DFixedConfig = {
  size: 17,
  waveSpeed: 1,
  domainLength: 1,
  initialCenterX: 0.5,
  initialCenterY: 0.5,
  gaussianWidth: 0.12,
  momentumWidth: 1.2,
  modeNumberX: 1,
  modeNumberY: 1,
  initialPreset: 'gaussian-wavepacket',
};

describe('Quantum2DPeriodicEngine', () => {
  it('conserves norm over long exact evolution', () => {
    const engine = new Quantum2DPeriodicEngine(torusConfig);
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 400; index += 1) {
      engine.step(dt);
    }

    expect(engine.getDiagnostics().normError).toBeLessThan(1e-10);
  });

  it('keeps probability density non-negative and normalized', () => {
    const engine = new Quantum2DPeriodicEngine({
      ...torusConfig,
      initialPreset: 'site-localized',
    });
    const snapshot = engine.getSnapshot();

    for (const value of snapshot.probabilityDensity) {
      expect(value).toBeGreaterThanOrEqual(0);
    }

    expect(snapshot.totalNorm).toBeCloseTo(1, 12);
  });

  it('evolves a selected torus normal mode by phase only', () => {
    const modeNumberX = 2;
    const modeNumberY = 3;
    const engine = new Quantum2DPeriodicEngine({
      ...torusConfig,
      initialPreset: 'selected-normal-mode',
      modeNumberX,
      modeNumberY,
    });

    const initialSnapshot = engine.getSnapshot('real-part');
    const dt = 0.137;
    const spacing = initialSnapshot.spacing;
    const angularFrequency =
      (2 * torusConfig.waveSpeed *
        Math.sqrt(
          Math.sin((Math.PI * modeNumberX) / torusConfig.size) ** 2 +
            Math.sin((Math.PI * modeNumberY) / torusConfig.size) ** 2,
        )) /
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

describe('Quantum2DFixedEngine', () => {
  it('conserves norm and keeps zero boundaries for the fixed-edge square', () => {
    const engine = new Quantum2DFixedEngine(squareConfig);
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 400; index += 1) {
      engine.step(dt);
    }

    const snapshot = engine.getSnapshot();
    expect(engine.getDiagnostics().normError).toBeLessThan(1e-10);
    expect(snapshot.totalNorm).toBeCloseTo(1, 12);

    for (let x = 0; x < snapshot.width; x += 1) {
      expect(snapshot.amplitudeReal[flattenIndex2D(x, 0, snapshot.width)]).toBeCloseTo(0, 12);
      expect(snapshot.amplitudeImaginary[flattenIndex2D(x, 0, snapshot.width)]).toBeCloseTo(0, 12);
      expect(
        snapshot.amplitudeReal[flattenIndex2D(x, snapshot.height - 1, snapshot.width)],
      ).toBeCloseTo(0, 12);
      expect(
        snapshot.amplitudeImaginary[flattenIndex2D(x, snapshot.height - 1, snapshot.width)],
      ).toBeCloseTo(0, 12);
    }
  });

  it('evolves a selected fixed-edge square mode by phase only', () => {
    const modeNumberX = 1;
    const modeNumberY = 2;
    const engine = new Quantum2DFixedEngine({
      ...squareConfig,
      initialPreset: 'selected-normal-mode',
      modeNumberX,
      modeNumberY,
    });

    const initialSnapshot = engine.getSnapshot('real-part');
    const dt = 0.173;
    const spacing = initialSnapshot.spacing;
    const interiorSize = squareConfig.size - 2;
    const angularFrequency =
      (2 * squareConfig.waveSpeed *
        Math.sqrt(
          Math.sin((Math.PI * modeNumberX) / (2 * (interiorSize + 1))) ** 2 +
            Math.sin((Math.PI * modeNumberY) / (2 * (interiorSize + 1))) ** 2,
        )) /
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
