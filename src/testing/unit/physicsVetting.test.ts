/**
 * Scientific validation suite. Expected values are derived analytically in
 * this file (discrete eigenvalues, semi-discrete solutions, convergence
 * orders, conservation laws) - never by calling the helper being tested.
 */
import {
  Classical1DPeriodicEngine,
  type Classical1DPeriodicConfig,
} from '../../physics/classical/classical1dPeriodic';
import {
  Classical1DFixedEngine,
  type Classical1DFixedConfig,
} from '../../physics/classical/classical1dFixed';
import {
  Classical2DEngine,
  applyDirichletLaplacian2D,
  applyPeriodicLaplacian2D,
  type Classical2DConfig,
} from '../../physics/classical/classical2d';
import {
  applyDirichletLaplacian1D,
  applyPeriodicLaplacian1D,
} from '../../physics/core/operators';
import { flattenIndex2D } from '../../physics/core/grids';
import {
  Quantum1DPeriodicEngine,
  type Quantum1DPeriodicConfig,
} from '../../physics/quantum/quantum1dPeriodic';
import {
  Quantum1DFixedEngine,
  type Quantum1DFixedConfig,
} from '../../physics/quantum/quantum1dFixed';
import {
  Quantum2DPeriodicEngine,
  type Quantum2DPeriodicConfig,
} from '../../physics/quantum/quantum2dPeriodic';
import {
  Quantum2DFixedEngine,
  type Quantum2DFixedConfig,
} from '../../physics/quantum/quantum2dFixed';
import { createFixedQuantumInitialState2D } from '../../physics/quantum/initialStates2d';

const periodicClassicalConfig: Classical1DPeriodicConfig = {
  siteCount: 128,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.8,
  initialCenter: 0.5,
  gaussianWidth: 0.05,
  modeNumbers: [1],
  initialPreset: 'gaussian-displacement',
};

const fixedClassicalConfig: Classical1DFixedConfig = {
  siteCount: 129,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.8,
  initialCenter: 0.5,
  gaussianWidth: 0.05,
  modeNumbers: [1],
  initialPreset: 'gaussian-displacement',
};

const periodicQuantumConfig: Quantum1DPeriodicConfig = {
  siteCount: 128,
  waveSpeed: 1,
  domainLength: 1,
  initialCenter: 0.5,
  gaussianWidth: 0.08,
  momentumWidth: 2,
  modeNumber: 3,
  modeNumbers: [1],
  initialPreset: 'gaussian-wavepacket',
};

const fixedQuantumConfig: Quantum1DFixedConfig = {
  siteCount: 129,
  waveSpeed: 1,
  domainLength: 1,
  initialCenter: 0.5,
  gaussianWidth: 0.08,
  momentumWidth: 2,
  modeNumber: 3,
  modeNumbers: [1],
  initialPreset: 'gaussian-wavepacket',
};

const periodicQuantum2DConfig: Quantum2DPeriodicConfig = {
  size: 24,
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

const fixedQuantum2DConfig: Quantum2DFixedConfig = {
  size: 25,
  waveSpeed: 1,
  domainLength: 1,
  initialCenterX: 0.5,
  initialCenterY: 0.5,
  gaussianWidth: 0.12,
  momentumWidth: 1.2,
  modeNumberX: 2,
  modeNumberY: 1,
  initialPreset: 'selected-normal-mode',
};

describe('operator spectra (12.1)', () => {
  it('every periodic 1D Fourier mode has eigenvalue -(4/h^2) sin^2(pi k / N)', () => {
    const siteCount = 16;
    const spacing = 0.5;
    const inverseSpacingSquared = 1 / (spacing * spacing);

    for (let mode = 0; mode < siteCount; mode += 1) {
      const field = new Float64Array(siteCount);
      for (let j = 0; j < siteCount; j += 1) {
        field[j] = Math.cos((2 * Math.PI * mode * j) / siteCount + 0.3);
      }

      const eigenvalue =
        -(4 * inverseSpacingSquared) *
        Math.sin((Math.PI * mode) / siteCount) ** 2;
      const result = applyPeriodicLaplacian1D(field, inverseSpacingSquared);

      for (let j = 0; j < siteCount; j += 1) {
        expect(result[j]).toBeCloseTo(eigenvalue * field[j], 9);
      }
    }
  });

  it('every fixed 1D sine mode has eigenvalue -(4/h^2) sin^2(pi m / (2(M+1)))', () => {
    const siteCount = 18;
    const interiorCount = siteCount - 2;
    const spacing = 1 / (siteCount - 1);
    const inverseSpacingSquared = 1 / (spacing * spacing);

    for (let mode = 1; mode <= interiorCount; mode += 1) {
      const field = new Float64Array(siteCount);
      for (let j = 1; j < siteCount - 1; j += 1) {
        field[j] = Math.sin((Math.PI * mode * j) / (siteCount - 1));
      }

      const eigenvalue =
        -(4 * inverseSpacingSquared) *
        Math.sin((Math.PI * mode) / (2 * (interiorCount + 1))) ** 2;
      const result = applyDirichletLaplacian1D(field, inverseSpacingSquared);

      for (let j = 1; j < siteCount - 1; j += 1) {
        expect(result[j]).toBeCloseTo(eigenvalue * field[j], 9);
      }
    }
  });

  it('representative periodic 2D product modes have the five-point eigenvalues', () => {
    const size = 8;
    const spacing = 1 / size;
    const inverseSpacingSquared = 1 / (spacing * spacing);

    for (const [modeX, modeY] of [
      [1, 2],
      [3, 0],
      [4, 4],
    ] as const) {
      const field = new Float64Array(size * size);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          field[flattenIndex2D(x, y, size)] =
            Math.cos((2 * Math.PI * modeX * x) / size) *
            Math.cos((2 * Math.PI * modeY * y) / size);
        }
      }

      const eigenvalue =
        -(4 * inverseSpacingSquared) *
        (Math.sin((Math.PI * modeX) / size) ** 2 +
          Math.sin((Math.PI * modeY) / size) ** 2);
      const result = applyPeriodicLaplacian2D(
        field,
        size,
        inverseSpacingSquared,
      );

      for (let index = 0; index < field.length; index += 1) {
        expect(result[index]).toBeCloseTo(eigenvalue * field[index], 9);
      }
    }
  });

  it('representative fixed 2D product sine modes have the five-point eigenvalues', () => {
    const size = 10;
    const interiorSize = size - 2;
    const spacing = 1 / (size - 1);
    const inverseSpacingSquared = 1 / (spacing * spacing);

    for (const [modeX, modeY] of [
      [1, 1],
      [2, 3],
      [interiorSize, interiorSize],
    ] as const) {
      const field = new Float64Array(size * size);
      for (let y = 1; y < size - 1; y += 1) {
        for (let x = 1; x < size - 1; x += 1) {
          field[flattenIndex2D(x, y, size)] =
            Math.sin((Math.PI * modeX * x) / (size - 1)) *
            Math.sin((Math.PI * modeY * y) / (size - 1));
        }
      }

      const eigenvalue =
        -(4 * inverseSpacingSquared) *
        (Math.sin((Math.PI * modeX) / (2 * (interiorSize + 1))) ** 2 +
          Math.sin((Math.PI * modeY) / (2 * (interiorSize + 1))) ** 2);
      const result = applyDirichletLaplacian2D(
        field,
        size,
        inverseSpacingSquared,
      );

      for (let y = 1; y < size - 1; y += 1) {
        for (let x = 1; x < size - 1; x += 1) {
          const index = flattenIndex2D(x, y, size);
          expect(result[index]).toBeCloseTo(eigenvalue * field[index], 9);
        }
      }
    }
  });
});

describe('temporal convergence (12.2)', () => {
  it('velocity Verlet converges at second order against the exact semi-discrete solution', () => {
    const siteCount = 32;
    const mode = 2;
    const amplitude = 0.5;
    const config: Classical1DPeriodicConfig = {
      siteCount,
      waveSpeed: 1,
      domainLength: 1,
      amplitude,
      initialCenter: 0.5,
      gaussianWidth: 0.05,
      modeNumbers: [mode],
      initialPreset: 'standing-modes',
    };
    const spacing = 1 / siteCount;
    const omega =
      (2 / spacing) * Math.abs(Math.sin((Math.PI * mode) / siteCount));
    const finalTime = 0.5;

    const maxErrorAt = (stepCount: number): number => {
      const engine = new Classical1DPeriodicEngine(config);
      const dt = finalTime / stepCount;
      for (let index = 0; index < stepCount; index += 1) {
        engine.step(dt);
      }
      const snapshot = engine.getSnapshot();
      let maxError = 0;
      for (let j = 0; j < siteCount; j += 1) {
        const exact =
          amplitude *
          Math.cos((2 * Math.PI * mode * j) / siteCount) *
          Math.cos(omega * finalTime);
        maxError = Math.max(
          maxError,
          Math.abs(snapshot.displacement[j] - exact),
        );
      }
      return maxError;
    };

    const coarseError = maxErrorAt(64);
    const fineError = maxErrorAt(128);
    const ratio = coarseError / fineError;

    expect(ratio).toBeGreaterThan(3.8);
    expect(ratio).toBeLessThan(4.2);
  });
});

describe('spatial convergence (12.3)', () => {
  it('the measured quantum modal frequency converges at second order to the continuum', () => {
    // The frequency is inferred from the engine's actual phase evolution, not
    // from the dispersion formula, so the engine is tested independently.
    const measureFrequency = (siteCount: number): number => {
      const engine = new Quantum1DPeriodicEngine({
        ...periodicQuantumConfig,
        siteCount,
        modeNumbers: [1],
        initialPreset: 'selected-normal-mode',
      });
      const time = 0.05;
      const initial = engine.getSnapshot();
      const initialReal = initial.amplitudeReal[0];
      const initialImaginary = initial.amplitudeImaginary[0];
      engine.setTime(time);
      const evolved = engine.getSnapshot();
      // psi_0(t) = e^{-i omega t} psi_0(0)
      const phase =
        Math.atan2(evolved.amplitudeImaginary[0], evolved.amplitudeReal[0]) -
        Math.atan2(initialImaginary, initialReal);
      return -phase / time;
    };

    const continuumOmega = 2 * Math.PI;
    const errors = [16, 32, 64].map((siteCount) =>
      Math.abs(measureFrequency(siteCount) - continuumOmega),
    );
    const firstRatio = errors[0] / errors[1];
    const secondRatio = errors[1] / errors[2];

    expect(firstRatio).toBeGreaterThan(3.9);
    expect(firstRatio).toBeLessThan(4.1);
    expect(secondRatio).toBeGreaterThan(3.9);
    expect(secondRatio).toBeLessThan(4.1);
  });
});

describe('classical invariants (12.4)', () => {
  it('displayed local energy density integrates to the total energy in every topology', () => {
    const periodic = new Classical1DPeriodicEngine(periodicClassicalConfig);
    periodic.step(0.07);
    const periodicSnapshot = periodic.getSnapshot();
    expect(
      sumOf(periodicSnapshot.localEnergyDensity) * periodicSnapshot.spacing,
    ).toBeCloseTo(periodicSnapshot.totalEnergy, 11);

    const fixed = new Classical1DFixedEngine(fixedClassicalConfig);
    fixed.step(0.07);
    const fixedSnapshot = fixed.getSnapshot();
    expect(
      sumOf(fixedSnapshot.localEnergyDensity) * fixedSnapshot.spacing,
    ).toBeCloseTo(fixedSnapshot.totalEnergy, 11);

    for (const geometry of ['torus-periodic', 'square-fixed'] as const) {
      const config: Classical2DConfig = {
        geometry,
        size: 24,
        waveSpeed: 1,
        domainLength: 1,
        amplitude: 0.8,
        gaussianWidth: 0.08,
        initialPreset: 'central-gaussian-displacement',
      };
      const engine = new Classical2DEngine(config);
      engine.step(0.05);
      const snapshot = engine.getSnapshot();
      expect(
        sumOf(snapshot.localEnergyDensity) *
          snapshot.spacing *
          snapshot.spacing,
      ).toBeCloseTo(snapshot.totalEnergy, 11);
    }
  });

  it('conserves the periodic mean velocity (the uniform mode drifts linearly)', () => {
    const engine = new Classical1DPeriodicEngine({
      ...periodicClassicalConfig,
      initialPreset: 'gaussian-velocity',
    });
    const initialMean = meanOf(engine.getSnapshot().velocity);
    expect(initialMean).toBeGreaterThan(0);

    for (let index = 0; index < 500; index += 1) {
      engine.step(engine.getDiagnostics().recommendedDt);
    }

    expect(meanOf(engine.getSnapshot().velocity)).toBeCloseTo(initialMean, 12);
  });

  it('the zero-mean velocity preset starts and remains at machine-zero mean', () => {
    const engine = new Classical1DPeriodicEngine({
      ...periodicClassicalConfig,
      initialPreset: 'zero-mean-gaussian-velocity',
    });
    expect(Math.abs(meanOf(engine.getSnapshot().velocity))).toBeLessThan(1e-15);

    for (let index = 0; index < 500; index += 1) {
      engine.step(engine.getDiagnostics().recommendedDt);
    }

    expect(Math.abs(meanOf(engine.getSnapshot().velocity))).toBeLessThan(1e-12);
  });

  it('keeps fixed boundary values exactly zero', () => {
    const engine = new Classical1DFixedEngine(fixedClassicalConfig);
    for (let index = 0; index < 300; index += 1) {
      engine.step(engine.getDiagnostics().recommendedDt);
    }
    const snapshot = engine.getSnapshot();
    expect(snapshot.displacement[0]).toBe(0);
    expect(snapshot.displacement[snapshot.siteCount - 1]).toBe(0);
    expect(snapshot.velocity[0]).toBe(0);
    expect(snapshot.velocity[snapshot.siteCount - 1]).toBe(0);
  });

  it('long-time Verlet energy error stays bounded and oscillatory over 20,000 steps', () => {
    const engine = new Classical1DPeriodicEngine({
      ...periodicClassicalConfig,
      siteCount: 64,
      modeNumbers: [1],
      initialPreset: 'standing-modes',
    });
    const dt = engine.getDiagnostics().recommendedDt;
    let maxDriftFirstHalf = 0;
    let maxDriftSecondHalf = 0;

    for (let index = 0; index < 20_000; index += 1) {
      engine.step(dt);
      if (index % 50 === 0) {
        const drift = engine.getDiagnostics().relativeEnergyDrift;
        if (index < 10_000) {
          maxDriftFirstHalf = Math.max(maxDriftFirstHalf, drift);
        } else {
          maxDriftSecondHalf = Math.max(maxDriftSecondHalf, drift);
        }
      }
    }

    expect(maxDriftSecondHalf).toBeLessThan(2e-3);
    // Bounded oscillation, not secular growth: the second half is no worse
    // than a small multiple of the first half.
    expect(maxDriftSecondHalf).toBeLessThan(maxDriftFirstHalf * 1.5 + 1e-6);
  });

  it('reports zero relative drift (not NaN) for a zero-energy initial state', () => {
    const engine = new Classical1DPeriodicEngine({
      ...periodicClassicalConfig,
      amplitude: 0,
    });
    engine.step(0.05);
    expect(engine.getDiagnostics().relativeEnergyDrift).toBe(0);
  });
});

describe('quantum invariants (12.5)', () => {
  it('conserves norm and the spectral energy expectation through t = 10,000', () => {
    const engine = new Quantum1DPeriodicEngine(periodicQuantumConfig);
    const initialEnergy = spectralEnergyOf(engine.getSnapshot(), 1);
    engine.setTime(10_000);
    const snapshot = engine.getSnapshot();

    expect(Math.abs(snapshot.totalNorm - 1)).toBeLessThan(1e-11);
    const finalEnergy = spectralEnergyOf(snapshot, 1);
    expect(Math.abs(finalEnergy - initialEnergy) / initialEnergy).toBeLessThan(
      1e-10,
    );
  });

  it('a selected mode changes only by a global phase', () => {
    const engine = new Quantum1DPeriodicEngine({
      ...periodicQuantumConfig,
      initialPreset: 'selected-normal-mode',
      modeNumbers: [3],
    });
    const initialDensity = engine.getSnapshot().probabilityDensity.slice();
    engine.setTime(7.3);
    const evolvedDensity = engine.getSnapshot().probabilityDensity;

    for (let index = 0; index < initialDensity.length; index += 1) {
      expect(evolvedDensity[index]).toBeCloseTo(initialDensity[index], 12);
    }
  });

  it('setTime is absolute: a later setTime is independent of earlier ones', () => {
    const engine = new Quantum1DPeriodicEngine(periodicQuantumConfig);
    engine.setTime(5);
    engine.setTime(2);
    const jumped = engine.getSnapshot();

    const fresh = new Quantum1DPeriodicEngine(periodicQuantumConfig);
    fresh.setTime(2);
    const direct = fresh.getSnapshot();

    for (let index = 0; index < jumped.amplitudeReal.length; index += 1) {
      expect(jumped.amplitudeReal[index]).toBeCloseTo(
        direct.amplitudeReal[index],
        13,
      );
      expect(jumped.amplitudeImaginary[index]).toBeCloseTo(
        direct.amplitudeImaginary[index],
        13,
      );
    }
  });

  it('repeated step(dt) agrees with a direct setTime(totalTime)', () => {
    const stepped = new Quantum1DFixedEngine(fixedQuantumConfig);
    stepped.step(0.4);
    stepped.step(0.35);
    stepped.step(0.25);

    const direct = new Quantum1DFixedEngine(fixedQuantumConfig);
    direct.setTime(1.0);

    const steppedSnapshot = stepped.getSnapshot();
    const directSnapshot = direct.getSnapshot();
    for (
      let index = 0;
      index < steppedSnapshot.amplitudeReal.length;
      index += 1
    ) {
      expect(steppedSnapshot.amplitudeReal[index]).toBeCloseTo(
        directSnapshot.amplitudeReal[index],
        12,
      );
    }
  });

  it('keeps fixed boundary amplitudes exactly zero', () => {
    const engine = new Quantum1DFixedEngine(fixedQuantumConfig);
    engine.setTime(23.7);
    const snapshot = engine.getSnapshot();
    expect(snapshot.amplitudeReal[0]).toBe(0);
    expect(snapshot.amplitudeImaginary[0]).toBe(0);
    expect(snapshot.amplitudeReal[snapshot.siteCount - 1]).toBe(0);
    expect(snapshot.amplitudeImaginary[snapshot.siteCount - 1]).toBe(0);

    const engine2d = new Quantum2DFixedEngine(fixedQuantum2DConfig);
    engine2d.setTime(11.4);
    const snapshot2d = engine2d.getSnapshot();
    const size = snapshot2d.width;
    for (let x = 0; x < size; x += 1) {
      expect(snapshot2d.amplitudeReal[flattenIndex2D(x, 0, size)]).toBe(0);
      expect(snapshot2d.amplitudeReal[flattenIndex2D(x, size - 1, size)]).toBe(
        0,
      );
      expect(snapshot2d.amplitudeReal[flattenIndex2D(0, x, size)]).toBe(0);
      expect(snapshot2d.amplitudeReal[flattenIndex2D(size - 1, x, size)]).toBe(
        0,
      );
    }
  });

  it('the periodic zero mode is static', () => {
    const engine = new Quantum1DPeriodicEngine({
      ...periodicQuantumConfig,
      initialPreset: 'selected-normal-mode',
      modeNumbers: [0],
    });
    const initial = engine.getSnapshot().amplitudeReal.slice();
    engine.setTime(50);
    const evolved = engine.getSnapshot();

    for (let index = 0; index < initial.length; index += 1) {
      expect(evolved.amplitudeReal[index]).toBeCloseTo(initial[index], 13);
      expect(evolved.amplitudeImaginary[index]).toBeCloseTo(0, 13);
    }
  });

  it('performs exactly one inverse transform per time update in every quantum engine', () => {
    const engines = [
      new Quantum1DPeriodicEngine(periodicQuantumConfig),
      new Quantum1DFixedEngine(fixedQuantumConfig),
      new Quantum2DPeriodicEngine(periodicQuantum2DConfig),
      new Quantum2DFixedEngine(fixedQuantum2DConfig),
    ];

    for (const engine of engines) {
      const before = engine.inverseTransformCount;
      engine.setTime(1.25);
      expect(engine.inverseTransformCount - before).toBe(1);
    }
  });
});

describe('initial conditions and edge cases (12.6)', () => {
  it('periodic localization near center = 0.99 maps through the seam to site zero', () => {
    const classical = new Classical1DPeriodicEngine({
      ...periodicClassicalConfig,
      siteCount: 100,
      initialPreset: 'single-site-displacement',
      initialCenter: 0.996,
    });
    const classicalSnapshot = classical.getSnapshot();
    expect(classicalSnapshot.displacement[0]).toBeCloseTo(0.8, 12);
    expect(classicalSnapshot.displacement[99]).toBe(0);

    const quantum = new Quantum1DPeriodicEngine({
      ...periodicQuantumConfig,
      siteCount: 100,
      initialPreset: 'site-localized',
      initialCenter: 0.996,
    });
    expect(quantum.getSnapshot().probabilityDensity[0]).toBeCloseTo(1, 12);
  });

  it('the periodic quantum localization uses its configured centre, not the middle', () => {
    const engine = new Quantum1DPeriodicEngine({
      ...periodicQuantumConfig,
      siteCount: 128,
      initialPreset: 'site-localized',
      initialCenter: 0.25,
    });
    expect(engine.getSnapshot().probabilityDensity[32]).toBeCloseTo(1, 12);
  });

  it('fixed localization uses the full physical coordinate grid', () => {
    const engine = new Quantum1DFixedEngine({
      ...fixedQuantumConfig,
      siteCount: 129,
      initialPreset: 'site-localized',
      initialCenter: 0.25,
    });
    // x = 0.25 on the full grid j/(N-1) is site j = 32.
    expect(engine.getSnapshot().probabilityDensity[32]).toBeCloseTo(1, 12);
  });

  it('periodic Gaussians wrap through the seam and fixed Gaussians do not', () => {
    const periodic = new Classical1DPeriodicEngine({
      ...periodicClassicalConfig,
      initialPreset: 'gaussian-displacement',
      initialCenter: 0.99,
    });
    // The seam site (index 0) is within ~0.01 of the centre after wrapping.
    expect(periodic.getSnapshot().displacement[0]).toBeGreaterThan(0.7);

    const fixed = new Classical1DFixedEngine({
      ...fixedClassicalConfig,
      initialPreset: 'gaussian-displacement',
      initialCenter: 0.9,
    });
    // Without wrapping, the far end (x = 0) is 0.9 away: e^{-0.5 (0.9/0.05)^2} ~ 0.
    expect(Math.abs(fixed.getSnapshot().displacement[1])).toBeLessThan(1e-12);
  });

  it('a periodic Gaussian displacement splits into two equal branches', () => {
    const siteCount = 128;
    const engine = new Classical1DPeriodicEngine({
      ...periodicClassicalConfig,
      siteCount,
      initialPreset: 'gaussian-displacement',
      initialCenter: 0.5,
      gaussianWidth: 0.03,
    });
    // c = 1, L = 1: after t = 0.125 each branch has moved 16 sites.
    engine.step(0.0625);
    engine.step(0.0625);
    const snapshot = engine.getSnapshot();
    const center = 64;
    const offset = 16;

    // Exact left-right symmetry and two comparable half-amplitude branches.
    expect(snapshot.displacement[center + offset]).toBeCloseTo(
      snapshot.displacement[center - offset],
      10,
    );
    expect(snapshot.displacement[center + offset]).toBeGreaterThan(0.3);
    expect(Math.abs(snapshot.displacement[center])).toBeLessThan(0.15);
  });

  it('the exact right-moving packet moves right with the opposite branch suppressed', () => {
    const siteCount = 128;
    const engine = new Classical1DPeriodicEngine({
      ...periodicClassicalConfig,
      siteCount,
      initialPreset: 'travelling-gaussian-right',
      initialCenter: 0.3,
      gaussianWidth: 0.04,
    });
    const initial = engine.getSnapshot().displacement.slice();
    // c = 1: after t = 16/128 the packet centre has moved +16 sites.
    engine.step(0.0625);
    engine.step(0.0625);
    const evolved = engine.getSnapshot().displacement;

    const correlationAtShift = (shift: number): number => {
      let total = 0;
      for (let j = 0; j < siteCount; j += 1) {
        total += evolved[j] * initial[(j - shift + siteCount) % siteCount];
      }
      return total;
    };

    const forward = correlationAtShift(16);
    const backward = correlationAtShift(-16);
    expect(forward).toBeGreaterThan(0);
    expect(forward).toBeGreaterThan(10 * Math.abs(backward));
  });

  it('the top fixed-mode superposition selects two distinct modes with norm one', () => {
    const siteCount = 33;
    const engine = new Quantum1DFixedEngine({
      ...fixedQuantumConfig,
      siteCount,
      initialPreset: 'counterpropagating-superposition',
      modeNumber: siteCount - 2,
    });
    const snapshot = engine.getSnapshot();
    expect(snapshot.totalNorm).toBeCloseTo(1, 12);
    // Two distinct modes carry weight 1/2 each.
    const weights = snapshot.modeWeights;
    expect(weights[siteCount - 3]).toBeCloseTo(0.5, 12);
    expect(weights[siteCount - 4]).toBeCloseTo(0.5, 12);
  });

  it('fixed 2D Gaussian carriers use the Dirichlet pi convention, not 2 pi', () => {
    const size = 17;
    const state = createFixedQuantumInitialState2D('gaussian-wavepacket', {
      size,
      centerX: 0.5,
      centerY: 0.5,
      gaussianWidth: 0.3,
      momentumWidth: 1,
      modeNumberX: 1,
      modeNumberY: 0,
    });

    const at = (x: number, y: number): [number, number] => [
      state.real[flattenIndex2D(x, y, size)],
      state.imaginary[flattenIndex2D(x, y, size)],
    ];
    const [realA, imaginaryA] = at(8, 8);
    const [realB, imaginaryB] = at(9, 8);
    const phaseIncrement =
      Math.atan2(imaginaryB, realB) - Math.atan2(imaginaryA, realA);

    // e^{i pi x} on the physical grid x = j/(size-1): increment pi/(size-1).
    expect(phaseIncrement).toBeCloseTo(Math.PI / (size - 1), 9);
  });

  it('rejects degenerate counterpropagating and split modes', () => {
    expect(
      () =>
        new Quantum1DPeriodicEngine({
          ...periodicQuantumConfig,
          initialPreset: 'counterpropagating-superposition',
          modeNumber: 0,
        }),
    ).toThrow(/distinct opposite/);
    expect(
      () =>
        new Quantum1DPeriodicEngine({
          ...periodicQuantumConfig,
          siteCount: 16,
          initialPreset: 'counterpropagating-superposition',
          modeNumber: 8,
        }),
    ).toThrow(/Nyquist/);
    expect(
      () =>
        new Quantum2DPeriodicEngine({
          ...periodicQuantum2DConfig,
          initialPreset: 'split-superposition',
          modeNumberX: 0,
        }),
    ).toThrow(/distinct opposite/);
    expect(
      () =>
        new Quantum2DPeriodicEngine({
          ...periodicQuantum2DConfig,
          size: 16,
          initialPreset: 'split-superposition',
          modeNumberX: 8,
        }),
    ).toThrow(/Nyquist/);
  });

  it('rejects topology-incompatible presets', () => {
    expect(
      () =>
        new Quantum2DFixedEngine({
          ...fixedQuantum2DConfig,
          initialPreset: 'split-superposition',
        }),
    ).toThrow(/periodic topology/);
    expect(
      () =>
        new Classical1DFixedEngine({
          ...fixedClassicalConfig,
          // Force the periodic-only preset through the type system to model
          // an untyped caller (e.g. a hand-edited scene URL).
          initialPreset: 'travelling-gaussian-right' as never,
        }),
    ).toThrow(/not valid/);
  });

  it('fails safely on NaN, infinity, fractional modes, zero states, and huge times', () => {
    expect(
      () =>
        new Classical1DPeriodicEngine({
          ...periodicClassicalConfig,
          amplitude: Number.NaN,
        }),
    ).toThrow(/finite/);
    expect(
      () =>
        new Classical1DPeriodicEngine({
          ...periodicClassicalConfig,
          waveSpeed: Number.POSITIVE_INFINITY,
        }),
    ).toThrow(/finite|positive/);
    expect(
      () =>
        new Quantum1DPeriodicEngine({
          ...periodicQuantumConfig,
          modeNumber: 1.5,
        }),
    ).toThrow(/integer/);
    expect(
      () =>
        new Quantum1DPeriodicEngine({
          ...periodicQuantumConfig,
          modeNumber: 4096,
        }),
    ).toThrow(/between/);
    expect(
      () =>
        new Quantum1DPeriodicEngine({
          ...periodicQuantumConfig,
          initialCenter: 1.5,
        }),
    ).toThrow(/\[0, 1\]/);

    // An extremely narrow fixed Gaussian centred on a pinned boundary
    // underflows to the zero state and must not produce 0/0 = NaN.
    expect(
      () =>
        new Quantum1DFixedEngine({
          ...fixedQuantumConfig,
          initialPreset: 'gaussian-wavepacket',
          initialCenter: 0,
          gaussianWidth: 0.00001,
        }),
    ).toThrow(/zero state/);

    const classical = new Classical1DPeriodicEngine(periodicClassicalConfig);
    expect(() => classical.step(Number.NaN)).toThrow(/finite/);
    expect(() => classical.step(1e9)).toThrow(/substeps/);

    const quantum = new Quantum1DPeriodicEngine(periodicQuantumConfig);
    expect(() => quantum.setTime(Number.NaN)).toThrow(/finite/);
    expect(() => quantum.setTime(1e30)).toThrow(/resolved/);
    expect(() => quantum.step(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });
});

describe('multi-mode superpositions', () => {
  it('classical standing-mode superpositions match the analytic sum of cosines', () => {
    const siteCount = 64;
    const amplitude = 0.4;
    const modeNumbers = [1, 3, 5] as const;
    const engine = new Classical1DPeriodicEngine({
      ...periodicClassicalConfig,
      siteCount,
      amplitude,
      modeNumbers: [...modeNumbers],
      initialPreset: 'standing-modes',
    });
    const snapshot = engine.getSnapshot();

    for (let j = 0; j < siteCount; j += 1) {
      let expected = 0;
      for (const mode of modeNumbers) {
        expected += amplitude * Math.cos((2 * Math.PI * mode * j) / siteCount);
      }
      expect(snapshot.displacement[j]).toBeCloseTo(expected, 12);
    }
  });

  it('classical Dirichlet standing-mode superpositions match the analytic sum of sines', () => {
    const siteCount = 65;
    const amplitude = 0.4;
    const modeNumbers = [2, 4] as const;
    const engine = new Classical1DFixedEngine({
      ...fixedClassicalConfig,
      siteCount,
      amplitude,
      modeNumbers: [...modeNumbers],
      initialPreset: 'standing-modes',
    });
    const snapshot = engine.getSnapshot();

    expect(snapshot.displacement[0]).toBe(0);
    expect(snapshot.displacement[siteCount - 1]).toBe(0);
    for (let j = 1; j < siteCount - 1; j += 1) {
      let expected = 0;
      for (const mode of modeNumbers) {
        expected +=
          amplitude * Math.sin((Math.PI * mode * j) / (siteCount - 1));
      }
      expect(snapshot.displacement[j]).toBeCloseTo(expected, 12);
    }
  });

  it('quantum normal-mode superpositions have exact unit norm and equal weights', () => {
    const periodic = new Quantum1DPeriodicEngine({
      ...periodicQuantumConfig,
      initialPreset: 'selected-normal-mode',
      modeNumbers: [0, 2, 5],
    });
    const periodicSnapshot = periodic.getSnapshot();
    expect(periodicSnapshot.totalNorm).toBeCloseTo(1, 12);
    expect(periodicSnapshot.modeWeights[0]).toBeCloseTo(1 / 3, 12);
    expect(periodicSnapshot.modeWeights[2]).toBeCloseTo(1 / 3, 12);
    expect(periodicSnapshot.modeWeights[5]).toBeCloseTo(1 / 3, 12);

    const fixed = new Quantum1DFixedEngine({
      ...fixedQuantumConfig,
      initialPreset: 'selected-normal-mode',
      modeNumbers: [1, 4],
    });
    const fixedSnapshot = fixed.getSnapshot();
    expect(fixedSnapshot.totalNorm).toBeCloseTo(1, 12);
    expect(fixedSnapshot.modeWeights[0]).toBeCloseTo(0.5, 12);
    expect(fixedSnapshot.modeWeights[3]).toBeCloseTo(0.5, 12);
  });

  it('rejects empty, duplicated, and out-of-range mode lists', () => {
    expect(
      () =>
        new Classical1DPeriodicEngine({
          ...periodicClassicalConfig,
          initialPreset: 'standing-modes',
          modeNumbers: [],
        }),
    ).toThrow(/non-empty/);
    expect(
      () =>
        new Classical1DPeriodicEngine({
          ...periodicClassicalConfig,
          initialPreset: 'standing-modes',
          modeNumbers: [2, 2],
        }),
    ).toThrow(/repeat/);
    expect(
      () =>
        new Quantum1DFixedEngine({
          ...fixedQuantumConfig,
          initialPreset: 'selected-normal-mode',
          modeNumbers: [0],
        }),
    ).toThrow(/between/);
    expect(
      () =>
        new Quantum1DPeriodicEngine({
          ...periodicQuantumConfig,
          initialPreset: 'selected-normal-mode',
          modeNumbers: [1.5],
        }),
    ).toThrow(/integer/);
  });
});

describe('deterministic reset (12.7)', () => {
  it('every engine resets exactly to its fresh time-zero state, twice', () => {
    const cases: {
      advance: () => void;
      arrays: () => Float64Array[];
      reset: () => void;
      fresh: () => Float64Array[];
      time: () => number;
    }[] = [];

    const classicalPeriodic = new Classical1DPeriodicEngine(
      periodicClassicalConfig,
    );
    cases.push({
      advance: () => classicalPeriodic.step(0.21),
      arrays: () => {
        const snapshot = classicalPeriodic.getSnapshot();
        return [snapshot.displacement, snapshot.velocity];
      },
      reset: () => classicalPeriodic.reset(periodicClassicalConfig),
      fresh: () => {
        const snapshot = new Classical1DPeriodicEngine(
          periodicClassicalConfig,
        ).getSnapshot();
        return [snapshot.displacement, snapshot.velocity];
      },
      time: () => classicalPeriodic.getSnapshot().time,
    });

    const classicalFixed = new Classical1DFixedEngine(fixedClassicalConfig);
    cases.push({
      advance: () => classicalFixed.step(0.21),
      arrays: () => {
        const snapshot = classicalFixed.getSnapshot();
        return [snapshot.displacement, snapshot.velocity];
      },
      reset: () => classicalFixed.reset(fixedClassicalConfig),
      fresh: () => {
        const snapshot = new Classical1DFixedEngine(
          fixedClassicalConfig,
        ).getSnapshot();
        return [snapshot.displacement, snapshot.velocity];
      },
      time: () => classicalFixed.getSnapshot().time,
    });

    for (const geometry of ['torus-periodic', 'square-fixed'] as const) {
      const config: Classical2DConfig = {
        geometry,
        size: 16,
        waveSpeed: 1,
        domainLength: 1,
        amplitude: 0.8,
        gaussianWidth: 0.1,
        initialPreset: 'central-gaussian-displacement',
      };
      const engine = new Classical2DEngine(config);
      cases.push({
        advance: () => engine.step(0.1),
        arrays: () => {
          const snapshot = engine.getSnapshot();
          return [snapshot.displacement, snapshot.velocity];
        },
        reset: () => engine.reset(config),
        fresh: () => {
          const snapshot = new Classical2DEngine(config).getSnapshot();
          return [snapshot.displacement, snapshot.velocity];
        },
        time: () => engine.getSnapshot().time,
      });
    }

    const quantumPeriodic = new Quantum1DPeriodicEngine(periodicQuantumConfig);
    cases.push({
      advance: () => quantumPeriodic.setTime(4.4),
      arrays: () => {
        const snapshot = quantumPeriodic.getSnapshot();
        return [snapshot.amplitudeReal, snapshot.amplitudeImaginary];
      },
      reset: () => quantumPeriodic.reset(periodicQuantumConfig),
      fresh: () => {
        const snapshot = new Quantum1DPeriodicEngine(
          periodicQuantumConfig,
        ).getSnapshot();
        return [snapshot.amplitudeReal, snapshot.amplitudeImaginary];
      },
      time: () => quantumPeriodic.getSnapshot().time,
    });

    const quantumFixed = new Quantum1DFixedEngine(fixedQuantumConfig);
    cases.push({
      advance: () => quantumFixed.setTime(4.4),
      arrays: () => {
        const snapshot = quantumFixed.getSnapshot();
        return [snapshot.amplitudeReal, snapshot.amplitudeImaginary];
      },
      reset: () => quantumFixed.reset(fixedQuantumConfig),
      fresh: () => {
        const snapshot = new Quantum1DFixedEngine(
          fixedQuantumConfig,
        ).getSnapshot();
        return [snapshot.amplitudeReal, snapshot.amplitudeImaginary];
      },
      time: () => quantumFixed.getSnapshot().time,
    });

    const quantum2DPeriodic = new Quantum2DPeriodicEngine(
      periodicQuantum2DConfig,
    );
    cases.push({
      advance: () => quantum2DPeriodic.setTime(2.2),
      arrays: () => {
        const snapshot = quantum2DPeriodic.getSnapshot();
        return [snapshot.amplitudeReal, snapshot.amplitudeImaginary];
      },
      reset: () => quantum2DPeriodic.reset(periodicQuantum2DConfig),
      fresh: () => {
        const snapshot = new Quantum2DPeriodicEngine(
          periodicQuantum2DConfig,
        ).getSnapshot();
        return [snapshot.amplitudeReal, snapshot.amplitudeImaginary];
      },
      time: () => quantum2DPeriodic.getSnapshot().time,
    });

    const quantum2DFixed = new Quantum2DFixedEngine(fixedQuantum2DConfig);
    cases.push({
      advance: () => quantum2DFixed.setTime(2.2),
      arrays: () => {
        const snapshot = quantum2DFixed.getSnapshot();
        return [snapshot.amplitudeReal, snapshot.amplitudeImaginary];
      },
      reset: () => quantum2DFixed.reset(fixedQuantum2DConfig),
      fresh: () => {
        const snapshot = new Quantum2DFixedEngine(
          fixedQuantum2DConfig,
        ).getSnapshot();
        return [snapshot.amplitudeReal, snapshot.amplitudeImaginary];
      },
      time: () => quantum2DFixed.getSnapshot().time,
    });

    for (const testCase of cases) {
      for (let round = 0; round < 2; round += 1) {
        testCase.advance();
        testCase.reset();
        expect(testCase.time()).toBe(0);

        const resetArrays = testCase.arrays();
        const freshArrays = testCase.fresh();
        for (
          let arrayIndex = 0;
          arrayIndex < resetArrays.length;
          arrayIndex += 1
        ) {
          expect(resetArrays[arrayIndex]).toEqual(freshArrays[arrayIndex]);
        }
      }
    }
  });
});

function sumOf(values: Float64Array): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function meanOf(values: Float64Array): number {
  return sumOf(values) / values.length;
}

/**
 * Spectral energy expectation sum_k omega_k |psi_hat_k|^2 computed with a
 * dense DFT written here, independent of the production transforms.
 */
function spectralEnergyOf(
  snapshot: {
    amplitudeReal: Float64Array;
    amplitudeImaginary: Float64Array;
    siteCount: number;
    spacing: number;
  },
  waveSpeed: number,
): number {
  const siteCount = snapshot.siteCount;
  const normalization = 1 / Math.sqrt(siteCount);
  let energy = 0;

  for (let mode = 0; mode < siteCount; mode += 1) {
    let sumReal = 0;
    let sumImaginary = 0;
    for (let j = 0; j < siteCount; j += 1) {
      const phase = (-2 * Math.PI * mode * j) / siteCount;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      sumReal +=
        snapshot.amplitudeReal[j] * cosPhase -
        snapshot.amplitudeImaginary[j] * sinPhase;
      sumImaginary +=
        snapshot.amplitudeReal[j] * sinPhase +
        snapshot.amplitudeImaginary[j] * cosPhase;
    }
    sumReal *= normalization;
    sumImaginary *= normalization;
    const omega =
      (2 * waveSpeed * Math.abs(Math.sin((Math.PI * mode) / siteCount))) /
      snapshot.spacing;
    energy += omega * (sumReal * sumReal + sumImaginary * sumImaginary);
  }

  return energy;
}
