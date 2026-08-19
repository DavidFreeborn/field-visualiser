import { bench, describe } from 'vitest';
import { PeriodicClassicalFieldRenderer } from '../../rendering/pixi/PeriodicClassicalFieldRenderer';
import type { Classical1DPeriodicSnapshot } from '../../physics/classical/classical1dPeriodic';
import type { Classical2DSnapshot } from '../../physics/classical/classical2d';

const WIDTH = 800;
const HEIGHT = 540;

function makePeriodic1DSnapshot(siteCount: number, time: number): Classical1DPeriodicSnapshot {
  const displacement = new Float64Array(siteCount);
  for (let index = 0; index < siteCount; index += 1) {
    displacement[index] = Math.sin((2 * Math.PI * index) / siteCount + time);
  }
  return {
    kind: 'classical-1d-periodic',
    time,
    systemLabel: '1D circle',
    boundaryCondition: 'periodic',
    modeLabel: 'classical field',
    quantity: 'displacement',
    siteCount,
    domainLength: 1,
    spacing: 1 / siteCount,
    displacement,
    velocity: new Float64Array(siteCount),
    localEnergyDensity: new Float64Array(siteCount),
    totalEnergy: 1,
    kineticEnergy: 0,
    potentialEnergy: 1,
  };
}

function make2DSnapshot(size: number): Classical2DSnapshot {
  const cells = size * size;
  const displacement = new Float64Array(cells);
  for (let index = 0; index < cells; index += 1) {
    displacement[index] = Math.sin(index * 0.37);
  }
  return {
    kind: 'classical-2d',
    time: 0,
    systemLabel: '2D torus',
    boundaryCondition: 'periodic',
    modeLabel: 'classical field',
    quantity: 'displacement',
    width: size,
    height: size,
    domainLength: 1,
    spacing: 1 / size,
    geometry: 'torus-periodic',
    displacement,
    velocity: new Float64Array(cells),
    localEnergyDensity: new Float64Array(cells),
    totalEnergy: 1,
    kineticEnergy: 0,
    potentialEnergy: 1,
  };
}

for (const siteCount of [128, 512, 2048]) {
  const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));
  let frame = 0;

  describe(`1D plot renderScene N=${siteCount}`, () => {
    bench(`plot view N=${siteCount}`, () => {
      frame += 1;
      renderer.renderScene(
        makePeriodic1DSnapshot(siteCount, frame * 0.016),
        { showLattice: true, showSprings: true, quantity: 'displacement', oneDView: 'plot' },
        WIDTH,
        HEIGHT,
      );
    });
  });
}

for (const siteCount of [128, 512, 2048]) {
  const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));
  let frame = 0;

  describe(`1D fixed-ring renderScene N=${siteCount}`, () => {
    bench(`fixed ring N=${siteCount}`, () => {
      frame += 1;
      renderer.renderScene(
        makePeriodic1DSnapshot(siteCount, frame * 0.016),
        {
          showLattice: true,
          showSprings: true,
          quantity: 'displacement',
          oneDView: 'ring',
          circleGeometryMode: 'fixed',
        },
        WIDTH,
        HEIGHT,
      );
    });
  });
}

for (const size of [48, 96, 256]) {
  const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));
  const snapshot = make2DSnapshot(size);

  describe(`2D heatmap renderScene ${size}x${size}`, () => {
    bench(`heatmap ${size}x${size}`, () => {
      renderer.renderScene(
        snapshot,
        { showLattice: false, showSprings: false, quantity: 'displacement' },
        WIDTH,
        HEIGHT,
      );
    });
  });
}
