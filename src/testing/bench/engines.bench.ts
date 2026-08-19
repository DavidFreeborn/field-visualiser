import { bench, describe } from 'vitest';
import { Classical1DPeriodicEngine } from '../../physics/classical/classical1dPeriodic';
import { Classical2DEngine } from '../../physics/classical/classical2d';
import { Quantum1DPeriodicEngine } from '../../physics/quantum/quantum1dPeriodic';
import { Quantum1DFixedEngine } from '../../physics/quantum/quantum1dFixed';
import { Quantum2DPeriodicEngine } from '../../physics/quantum/quantum2dPeriodic';
import { Quantum2DFixedEngine } from '../../physics/quantum/quantum2dFixed';

// 1D classical update + snapshot at the exposed resolutions.
for (const siteCount of [128, 512, 2048]) {
  const engine = new Classical1DPeriodicEngine({
    siteCount,
    waveSpeed: 1,
    domainLength: 1,
    amplitude: 0.9,
    initialCenter: 0.5,
    gaussianWidth: 0.06,
    modeNumbers: [1],
    initialPreset: 'gaussian-displacement',
  });
  const frameDt = engine.getDiagnostics().recommendedDt;

  describe(`1D classical update+snapshot N=${siteCount}`, () => {
    bench(`step+getSnapshot N=${siteCount}`, () => {
      engine.step(frameDt);
      engine.getSnapshot('displacement');
    });
  });
}

// 1D quantum target-time update + snapshot.
for (const siteCount of [128, 512, 2048]) {
  const engine = new Quantum1DPeriodicEngine({
    siteCount,
    waveSpeed: 1,
    domainLength: 1,
    initialCenter: 0.5,
    gaussianWidth: 0.08,
    momentumWidth: 2,
    modeNumber: 6,
    modeNumbers: [1],
    initialPreset: 'gaussian-wavepacket',
  });
  let simulatedTime = 0;

  describe(`1D quantum periodic setTime+snapshot N=${siteCount}`, () => {
    bench(`setTime+getSnapshot N=${siteCount}`, () => {
      simulatedTime += 1 / 60;
      engine.setTime(simulatedTime);
      engine.getSnapshot('probability-density');
    });
  });
}

for (const siteCount of [129, 513, 2049]) {
  const engine = new Quantum1DFixedEngine({
    siteCount,
    waveSpeed: 1,
    domainLength: 1,
    initialCenter: 0.5,
    gaussianWidth: 0.08,
    momentumWidth: 2,
    modeNumber: 6,
    modeNumbers: [1],
    initialPreset: 'gaussian-wavepacket',
  });
  let simulatedTime = 0;

  describe(`1D quantum fixed setTime+snapshot N=${siteCount}`, () => {
    bench(`setTime+getSnapshot N=${siteCount}`, () => {
      simulatedTime += 1 / 60;
      engine.setTime(simulatedTime);
      engine.getSnapshot('probability-density');
    });
  });
}

// 2D classical update at representative low / medium / maximum exposed sizes.
for (const size of [48, 128, 256]) {
  const engine = new Classical2DEngine({
    geometry: 'torus-periodic',
    size,
    waveSpeed: 1,
    domainLength: 1,
    amplitude: 0.9,
    gaussianWidth: 0.08,
    initialPreset: 'wraparound-pulse',
  });
  const frameDt = engine.getDiagnostics().recommendedDt;

  describe(`2D classical update ${size}x${size}`, () => {
    bench(`step ${size}x${size}`, () => {
      engine.step(frameDt);
    });
  });
}

// 2D quantum target-time update at representative exposed sizes.
for (const size of [24, 48, 96]) {
  const engine = new Quantum2DPeriodicEngine({
    size,
    waveSpeed: 1,
    domainLength: 1,
    initialCenterX: 0.5,
    initialCenterY: 0.5,
    gaussianWidth: 0.12,
    momentumWidth: 1.2,
    modeNumberX: 3,
    modeNumberY: 0,
    initialPreset: 'gaussian-wavepacket',
  });
  let simulatedTime = 0;

  describe(`2D quantum periodic setTime ${size}x${size}`, () => {
    bench(`setTime+display ${size}x${size}`, () => {
      simulatedTime += 1 / 60;
      engine.setTime(simulatedTime);
      engine.getDisplaySnapshot('probability-density');
    });
  });
}

for (const size of [25, 49, 81]) {
  const engine = new Quantum2DFixedEngine({
    size,
    waveSpeed: 1,
    domainLength: 1,
    initialCenterX: 0.5,
    initialCenterY: 0.5,
    gaussianWidth: 0.12,
    momentumWidth: 1.2,
    modeNumberX: 1,
    modeNumberY: 1,
    initialPreset: 'gaussian-wavepacket',
  });
  let simulatedTime = 0;

  describe(`2D quantum fixed setTime ${size}x${size}`, () => {
    bench(`setTime+display ${size}x${size}`, () => {
      simulatedTime += 1 / 60;
      engine.setTime(simulatedTime);
      engine.getDisplaySnapshot('probability-density');
    });
  });
}
