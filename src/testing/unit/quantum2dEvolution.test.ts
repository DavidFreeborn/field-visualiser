import {
  Quantum2DPeriodicEngine,
  type Quantum2DPeriodicConfig,
} from '../../physics/quantum/quantum2dPeriodic';
import {
  Quantum2DFixedEngine,
  type Quantum2DFixedConfig,
} from '../../physics/quantum/quantum2dFixed';

/**
 * Distinguishes legitimate stationary states from scheduling or rendering
 * failures: a site-localized 2D state must visibly change under evolution,
 * while a single normal mode's probability must stay exactly static (its time
 * evolution is a global phase).
 */

const periodicConfig: Quantum2DPeriodicConfig = {
  size: 24,
  waveSpeed: 1,
  domainLength: 1,
  initialCenterX: 0.5,
  initialCenterY: 0.5,
  gaussianWidth: 0.12,
  momentumWidth: 1.2,
  modeNumberX: 3,
  modeNumberY: 0,
  initialPreset: 'site-localized',
};

const fixedConfig: Quantum2DFixedConfig = {
  ...periodicConfig,
  size: 25,
  modeNumberX: 1,
  modeNumberY: 1,
};

function l2Difference(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index] - b[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

describe('2D quantum probability evolution', () => {
  it('a site-localized periodic state changes by a meaningful norm after a nonzero interval', () => {
    const engine = new Quantum2DPeriodicEngine(periodicConfig);
    const before = engine.getDisplaySnapshot('probability-density').displayValues.slice();

    engine.setTime(0.05);
    const after = engine.getDisplaySnapshot('probability-density').displayValues;

    expect(l2Difference(before, after)).toBeGreaterThan(0.05);
    expect(engine.getDiagnostics().normError).toBeLessThan(1e-10);
  });

  it('a site-localized fixed-edge state changes by a meaningful norm after a nonzero interval', () => {
    const engine = new Quantum2DFixedEngine(fixedConfig);
    const before = engine.getDisplaySnapshot('probability-density').displayValues.slice();

    engine.setTime(0.05);
    const after = engine.getDisplaySnapshot('probability-density').displayValues;

    expect(l2Difference(before, after)).toBeGreaterThan(0.05);
    expect(engine.getDiagnostics().normError).toBeLessThan(1e-10);
  });

  it('a selected normal mode is a stationary state: probability stays static while phase rotates', () => {
    const engine = new Quantum2DPeriodicEngine({
      ...periodicConfig,
      initialPreset: 'selected-normal-mode',
    });
    const probabilityBefore = engine
      .getDisplaySnapshot('probability-density')
      .displayValues.slice();
    const realBefore = engine.getDisplaySnapshot('real-part').displayValues.slice();

    engine.setTime(0.35);
    const probabilityAfter = engine.getDisplaySnapshot('probability-density').displayValues;
    const realAfter = engine.getDisplaySnapshot('real-part').displayValues;

    // Probability distribution does not change (global phase only)...
    expect(l2Difference(probabilityBefore, probabilityAfter)).toBeLessThan(1e-6);
    // ...but the state itself demonstrably evolves.
    expect(l2Difference(realBefore, realAfter)).toBeGreaterThan(0.01);
  });
});
