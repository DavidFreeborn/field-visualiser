import {
  Classical2DEngine,
  applyDirichletLaplacian2D,
  applyPeriodicLaplacian2D,
  type Classical2DConfig,
} from '../../physics/classical/classical2d';
import { flattenIndex2D } from '../../physics/core/grids';

const torusConfig: Classical2DConfig = {
  geometry: 'torus-periodic',
  size: 24,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.8,
  gaussianWidth: 0.08,
  initialPreset: 'central-gaussian-displacement',
};

const squareConfig: Classical2DConfig = {
  geometry: 'square-fixed',
  size: 24,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.8,
  gaussianWidth: 0.08,
  initialPreset: 'central-gaussian-displacement',
};

describe('applyPeriodicLaplacian2D', () => {
  it('matches the discrete Laplacian eigenvalue for a periodic cosine mode', () => {
    const size = 8;
    const field = new Float64Array(size * size);
    const modeX = 1;
    const modeY = 2;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        field[flattenIndex2D(x, y, size)] =
          Math.cos((2 * Math.PI * modeX * x) / size) *
          Math.cos((2 * Math.PI * modeY * y) / size);
      }
    }

    const laplacian = applyPeriodicLaplacian2D(field, size, 1);
    const eigenvalue =
      2 * Math.cos((2 * Math.PI * modeX) / size) +
      2 * Math.cos((2 * Math.PI * modeY) / size) -
      4;

    for (let index = 0; index < field.length; index += 1) {
      expect(laplacian[index]).toBeCloseTo(eigenvalue * field[index], 10);
    }
  });
});

describe('applyDirichletLaplacian2D', () => {
  it('keeps fixed-edge boundary accelerations clamped to zero', () => {
    const size = 5;
    const field = new Float64Array([
      0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 4, 5, 6, 0, 0, 7, 8, 9, 0, 0, 0, 0, 0, 0,
    ]);

    const laplacian = applyDirichletLaplacian2D(field, size, 1);

    for (let x = 0; x < size; x += 1) {
      expect(laplacian[flattenIndex2D(x, 0, size)]).toBe(0);
      expect(laplacian[flattenIndex2D(x, size - 1, size)]).toBe(0);
    }

    for (let y = 0; y < size; y += 1) {
      expect(laplacian[flattenIndex2D(0, y, size)]).toBe(0);
      expect(laplacian[flattenIndex2D(size - 1, y, size)]).toBe(0);
    }
  });
});

describe('Classical2DEngine', () => {
  it('keeps fixed boundaries clamped during time evolution', () => {
    const engine = new Classical2DEngine(squareConfig);
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 200; index += 1) {
      engine.step(dt);
    }

    const snapshot = engine.getSnapshot();

    for (let x = 0; x < snapshot.width; x += 1) {
      expect(snapshot.displacement[flattenIndex2D(x, 0, snapshot.width)]).toBe(
        0,
      );
      expect(
        snapshot.displacement[
          flattenIndex2D(x, snapshot.height - 1, snapshot.width)
        ],
      ).toBe(0);
      expect(snapshot.velocity[flattenIndex2D(x, 0, snapshot.width)]).toBe(0);
      expect(
        snapshot.velocity[
          flattenIndex2D(x, snapshot.height - 1, snapshot.width)
        ],
      ).toBe(0);
    }
  });

  it('keeps energy drift below tolerance over a long 2D torus run', () => {
    const engine = new Classical2DEngine({
      ...torusConfig,
      size: 32,
      initialPreset: 'wraparound-pulse',
    });
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 1_000; index += 1) {
      engine.step(dt);
    }

    expect(engine.getDiagnostics().relativeEnergyDrift).toBeLessThan(3e-3);
  });

  it('matches the analytical period of the low fixed-edge standing mode', () => {
    const engine = new Classical2DEngine({
      ...squareConfig,
      size: 24,
      initialPreset: 'square-standing-mode-1-1',
    });
    const initialSnapshot = engine.getSnapshot();
    const dt = engine.getDiagnostics().recommendedDt;
    const denominator = initialSnapshot.width - 1;
    const spacing = initialSnapshot.spacing;
    const angularFrequency =
      (engineModeSpeed(squareConfig) / spacing) *
      Math.sqrt(
        4 -
          2 * Math.cos(Math.PI / denominator) -
          2 * Math.cos(Math.PI / denominator),
      );
    const period = (2 * Math.PI) / angularFrequency;
    const steps = Math.round(period / dt);

    for (let index = 0; index < steps; index += 1) {
      engine.step(dt);
    }

    const finalSnapshot = engine.getSnapshot();
    const centerIndex = flattenIndex2D(
      Math.floor(initialSnapshot.width / 2),
      Math.floor(initialSnapshot.height / 2),
      initialSnapshot.width,
    );

    expect(finalSnapshot.time).toBeCloseTo(steps * dt, 12);
    expect(steps * dt).toBeCloseTo(period, 2);
    expect(finalSnapshot.displacement[centerIndex]).toBeCloseTo(
      initialSnapshot.displacement[centerIndex],
      2,
    );
    expect(
      finalSnapshot.displacement[flattenIndex2D(0, 0, initialSnapshot.width)],
    ).toBe(0);
  });

  it('matches the locked baseline for a representative 2D torus classical evolution', () => {
    const engine = new Classical2DEngine(torusConfig);
    const dt = engine.getDiagnostics().recommendedDt;

    for (let index = 0; index < 18; index += 1) {
      engine.step(dt);
    }

    const snapshot = engine.getSnapshot();
    const diagnostics = engine.getDiagnostics();
    const centerIndex = flattenIndex2D(12, 12, snapshot.width);
    const xIndex = flattenIndex2D(6, 12, snapshot.width);
    const yIndex = flattenIndex2D(12, 6, snapshot.width);

    // Baseline re-locked after the coordinate-convention correction: the
    // torus Gaussian now samples x/size with the shortest periodic (wrapped)
    // displacement instead of the fixed-grid x/(size-1) convention.
    expect(snapshot.time).toBeCloseTo(0.10606601717798217, 12);
    expect(snapshot.displacement[centerIndex]).toBeCloseTo(
      -0.002071347354692818,
      12,
    );
    expect(snapshot.displacement[xIndex]).toBeCloseTo(0.06163687043793235, 12);
    expect(snapshot.displacement[yIndex]).toBeCloseTo(0.06163687043793235, 12);
    expect(snapshot.velocity[centerIndex]).toBeCloseTo(-7.942838974759761, 12);
    expect(snapshot.totalEnergy).toBeCloseTo(0.9704243732002875, 12);
    expect(diagnostics.relativeEnergyDrift).toBeCloseTo(
      0.0015993300585713612,
      12,
    );
  });
});

function engineModeSpeed(config: Classical2DConfig): number {
  return config.waveSpeed;
}
