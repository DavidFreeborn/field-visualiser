import { PeriodicClassicalFieldRenderer } from '../../rendering/pixi/PeriodicClassicalFieldRenderer';
import type { Classical1DPeriodicSnapshot } from '../../physics/classical/classical1dPeriodic';
import type { Classical1DFixedSnapshot } from '../../physics/classical/classical1dFixed';
import type { Classical2DSnapshot } from '../../physics/classical/classical2d';

const WIDTH = 800;
const HEIGHT = 540;

function make1DSnapshot(siteCount: number): Classical1DPeriodicSnapshot {
  const displacement = new Float64Array(siteCount);
  const velocity = new Float64Array(siteCount);
  const localEnergyDensity = new Float64Array(siteCount);
  for (let index = 0; index < siteCount; index += 1) {
    displacement[index] = Math.sin((2 * Math.PI * index) / siteCount);
    localEnergyDensity[index] = displacement[index] * displacement[index] * 4 + 0.1;
  }
  return {
    kind: 'classical-1d-periodic',
    time: 0.5,
    systemLabel: '1D circle',
    boundaryCondition: 'periodic',
    modeLabel: 'classical field',
    quantity: 'energy-density',
    siteCount,
    domainLength: 1,
    spacing: 1 / siteCount,
    displacement,
    velocity,
    localEnergyDensity,
    totalEnergy: 1,
    kineticEnergy: 0,
    potentialEnergy: 1,
  };
}

function make2DSnapshot(size: number, geometry: 'torus-periodic' | 'square-fixed'): Classical2DSnapshot {
  const cells = size * size;
  const localEnergyDensity = new Float64Array(cells);
  for (let index = 0; index < cells; index += 1) {
    localEnergyDensity[index] = Math.abs(Math.sin(index * 0.37)) + 0.05;
  }
  return {
    kind: 'classical-2d',
    time: 0.5,
    systemLabel: geometry === 'torus-periodic' ? '2D torus' : '2D square',
    boundaryCondition: geometry === 'torus-periodic' ? 'periodic' : 'dirichlet',
    modeLabel: 'classical field',
    quantity: 'energy-density',
    width: size,
    height: size,
    domainLength: 1,
    spacing: 1 / size,
    geometry,
    displacement: new Float64Array(cells),
    velocity: new Float64Array(cells),
    localEnergyDensity,
    totalEnergy: 1,
    kineticEnergy: 0,
    potentialEnergy: 1,
  };
}

const base = { showLattice: false, showSprings: false, quantity: 'energy-density' } as const;

describe('energy density renders in every classical geometry', () => {
  it('periodic deforming circle', () => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));
    const info = renderer.renderScene(make1DSnapshot(128), { ...base, oneDView: 'ring' }, WIDTH, HEIGHT);
    // Non-negative quantity: sequential map (unsigned) with a real scale.
    expect(info.signed).toBe(false);
    expect(info.scaleMax).toBeGreaterThan(0.1);
    expect(renderer.getPrimitiveInstructionCount()).toBeGreaterThan(0);
    renderer.destroy();
  });

  it('periodic fixed ring (annular sequential color band)', () => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));
    const info = renderer.renderScene(
      make1DSnapshot(128),
      { ...base, oneDView: 'ring', circleGeometryMode: 'fixed' },
      WIDTH,
      HEIGHT,
    );
    expect(info.signed).toBe(false);
    // The fixed ring path draws the annular texture band (counted as a primitive).
    expect(renderer.getPrimitiveInstructionCount()).toBeGreaterThan(0);
    renderer.destroy();
  });

  it('fixed-end interval (unwrapped plot)', () => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));
    const snapshot: Classical1DFixedSnapshot = {
      ...make1DSnapshot(129),
      kind: 'classical-1d-fixed',
      systemLabel: '1D interval',
      boundaryCondition: 'dirichlet',
    };
    const info = renderer.renderScene(snapshot, base, WIDTH, HEIGHT);
    expect(info.signed).toBe(false);
    expect(renderer.getGuideInstructionCount()).toBeGreaterThan(0);
    renderer.destroy();
  });

  it.each(['square-fixed', 'torus-periodic'] as const)('2D %s heatmap', (geometry) => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));
    const info = renderer.renderScene(make2DSnapshot(48, geometry), base, WIDTH, HEIGHT);
    expect(info.signed).toBe(false);
    expect(info.scaleMax).toBeGreaterThan(0.5);
    renderer.destroy();
  });
});
