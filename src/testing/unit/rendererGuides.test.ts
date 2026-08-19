/**
 * Regression tests for the Pixi guide-layer lifecycle and the screen-space
 * level-of-detail stage. The renderer's display list is built headlessly via
 * renderScene(), which needs no WebGL context.
 */
import { PeriodicClassicalFieldRenderer } from '../../rendering/pixi/PeriodicClassicalFieldRenderer';
import type { Classical1DPeriodicSnapshot } from '../../physics/classical/classical1dPeriodic';
import type { Classical1DFixedSnapshot } from '../../physics/classical/classical1dFixed';
import type { Classical2DSnapshot } from '../../physics/classical/classical2d';

const WIDTH = 800;
const HEIGHT = 540;

function makePeriodic1DSnapshot(
  siteCount: number,
  time = 0,
): Classical1DPeriodicSnapshot {
  const displacement = new Float64Array(siteCount);
  const velocity = new Float64Array(siteCount);
  const localEnergyDensity = new Float64Array(siteCount);
  for (let index = 0; index < siteCount; index += 1) {
    displacement[index] = Math.sin((2 * Math.PI * index) / siteCount + time);
    localEnergyDensity[index] = displacement[index] * displacement[index];
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
    velocity,
    localEnergyDensity,
    totalEnergy: 1,
    kineticEnergy: 0,
    potentialEnergy: 1,
  };
}

function makeFixed1DSnapshot(siteCount: number): Classical1DFixedSnapshot {
  const base = makePeriodic1DSnapshot(siteCount);
  return {
    ...base,
    kind: 'classical-1d-fixed',
    systemLabel: '1D interval',
    boundaryCondition: 'dirichlet',
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

const baseOptions = {
  showLattice: false,
  showSprings: false,
  quantity: 'displacement',
  oneDView: 'ring',
} as const;

describe('guide layer lifecycle (defect A)', () => {
  it('keeps the guide geometry count constant over 1000 deforming-ring frames', () => {
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );

    renderer.renderScene(
      makePeriodic1DSnapshot(128, 0),
      baseOptions,
      WIDTH,
      HEIGHT,
    );
    const initialCount = renderer.getGuideInstructionCount();
    expect(initialCount).toBeGreaterThan(0);

    for (let frame = 1; frame <= 1000; frame += 1) {
      renderer.renderScene(
        makePeriodic1DSnapshot(128, frame * 0.016),
        baseOptions,
        WIDTH,
        HEIGHT,
      );
    }

    expect(renderer.getGuideInstructionCount()).toBe(initialCount);
    renderer.destroy();
  });

  it('keeps the guide geometry count constant over 1000 fixed-ring frames', () => {
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );
    const options = { ...baseOptions, circleGeometryMode: 'fixed' } as const;

    renderer.renderScene(
      makePeriodic1DSnapshot(128, 0),
      options,
      WIDTH,
      HEIGHT,
    );
    const initialCount = renderer.getGuideInstructionCount();
    expect(initialCount).toBeGreaterThan(0);

    for (let frame = 1; frame <= 1000; frame += 1) {
      renderer.renderScene(
        makePeriodic1DSnapshot(128, frame * 0.016),
        options,
        WIDTH,
        HEIGHT,
      );
    }

    expect(renderer.getGuideInstructionCount()).toBe(initialCount);
    renderer.destroy();
  });

  it('removes the circle guide when switching from a circular view to a 2D heatmap', () => {
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );

    renderer.renderScene(
      makePeriodic1DSnapshot(128),
      baseOptions,
      WIDTH,
      HEIGHT,
    );
    expect(renderer.getGuideInstructionCount()).toBeGreaterThan(0);

    renderer.renderScene(
      make2DSnapshot(48),
      { showLattice: false, showSprings: false, quantity: 'displacement' },
      WIDTH,
      HEIGHT,
    );
    expect(renderer.getGuideInstructionCount()).toBe(0);
    renderer.destroy();
  });

  it('removes the circle guide when switching from the fixed ring to a 2D heatmap', () => {
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );

    renderer.renderScene(
      makePeriodic1DSnapshot(128),
      { ...baseOptions, circleGeometryMode: 'fixed' },
      WIDTH,
      HEIGHT,
    );
    expect(renderer.getGuideInstructionCount()).toBeGreaterThan(0);

    renderer.renderScene(
      make2DSnapshot(48),
      { showLattice: false, showSprings: false, quantity: 'displacement' },
      WIDTH,
      HEIGHT,
    );
    expect(renderer.getGuideInstructionCount()).toBe(0);
    renderer.destroy();
  });

  it('replaces the circle guide with plot guides when switching circle -> interval', () => {
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );

    renderer.renderScene(
      makePeriodic1DSnapshot(128),
      baseOptions,
      WIDTH,
      HEIGHT,
    );
    const circleCount = renderer.getGuideInstructionCount();
    expect(circleCount).toBeGreaterThan(0);

    renderer.renderScene(
      makeFixed1DSnapshot(129),
      { showLattice: false, showSprings: false, quantity: 'displacement' },
      WIDTH,
      HEIGHT,
    );
    const plotCount = renderer.getGuideInstructionCount();
    expect(plotCount).toBeGreaterThan(0);

    // Drawing another interval frame must not accumulate further guides.
    renderer.renderScene(
      makeFixed1DSnapshot(129),
      { showLattice: false, showSprings: false, quantity: 'displacement' },
      WIDTH,
      HEIGHT,
    );
    expect(renderer.getGuideInstructionCount()).toBe(plotCount);
    renderer.destroy();
  });

  it('restores guides when switching 2D -> circle after a 2D view', () => {
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );

    renderer.renderScene(
      make2DSnapshot(48),
      { showLattice: false, showSprings: false, quantity: 'displacement' },
      WIDTH,
      HEIGHT,
    );
    expect(renderer.getGuideInstructionCount()).toBe(0);

    renderer.renderScene(
      makePeriodic1DSnapshot(128),
      baseOptions,
      WIDTH,
      HEIGHT,
    );
    expect(renderer.getGuideInstructionCount()).toBeGreaterThan(0);
    renderer.destroy();
  });

  it('clears interval plot guides when switching interval -> 2D', () => {
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );

    renderer.renderScene(
      makeFixed1DSnapshot(129),
      { showLattice: false, showSprings: false, quantity: 'displacement' },
      WIDTH,
      HEIGHT,
    );
    expect(renderer.getGuideInstructionCount()).toBeGreaterThan(0);

    renderer.renderScene(
      make2DSnapshot(48),
      { showLattice: false, showSprings: false, quantity: 'displacement' },
      WIDTH,
      HEIGHT,
    );
    expect(renderer.getGuideInstructionCount()).toBe(0);
    renderer.destroy();
  });
});

describe('pixel-budget level of detail (defect F)', () => {
  it('bounds rendered primitives independently of lattice size on the plot view', () => {
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );
    const options = {
      showLattice: true,
      showSprings: true,
      quantity: 'displacement',
      oneDView: 'plot',
    } as const;

    renderer.renderScene(makePeriodic1DSnapshot(2048), options, WIDTH, HEIGHT);
    const countAt2048 = renderer.getPrimitiveInstructionCount();

    renderer.renderScene(makePeriodic1DSnapshot(4096), options, WIDTH, HEIGHT);
    const countAt4096 = renderer.getPrimitiveInstructionCount();

    // Once past the pixel budget, the retained instruction count is a small
    // constant, independent of lattice size.
    expect(countAt2048).toBeLessThan(16);
    expect(countAt4096).toBe(countAt2048);
    renderer.destroy();
  });

  it('never fills the ring envelope band above the pixel budget (freeze regression)', () => {
    // Filling the closed ring-band polygon at binned site counts triangulated
    // pathologically in Pixi (~1.5 s per frame at 2048 sites); the envelope
    // must be drawn as strokes on ring geometry.
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );
    const options = {
      showLattice: false,
      showSprings: false,
      quantity: 'displacement',
      oneDView: 'ring',
    } as const;

    renderer.renderScene(makePeriodic1DSnapshot(2048), options, WIDTH, HEIGHT);
    expect(renderer.getEnvelopeFillInstructionCount()).toBe(0);
    // The envelope information itself is still present (stroked min/max).
    expect(renderer.getPrimitiveInstructionCount()).toBeGreaterThan(0);
    renderer.destroy();
  });

  it('bounds rendered primitives on the fixed ring independent of lattice size', () => {
    const renderer = new PeriodicClassicalFieldRenderer(
      document.createElement('div'),
    );
    const options = {
      showLattice: true,
      showSprings: true,
      quantity: 'displacement',
      oneDView: 'ring',
      circleGeometryMode: 'fixed',
    } as const;

    renderer.renderScene(makePeriodic1DSnapshot(2048), options, WIDTH, HEIGHT);
    const instructionCount = renderer.getPrimitiveInstructionCount();

    // The fixed ring is one textured mesh plus a bounded number of overlays:
    // nothing remotely close to one stroke per site.
    expect(instructionCount).toBeLessThan(64);
    renderer.destroy();
  });
});
