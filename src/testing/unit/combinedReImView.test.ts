import { PeriodicClassicalFieldRenderer } from '../../rendering/pixi/PeriodicClassicalFieldRenderer';
import type { Quantum1DPeriodicSnapshot } from '../../physics/quantum/quantum1dPeriodic';
import type { Quantum1DFixedSnapshot } from '../../physics/quantum/quantum1dFixed';
import { LineLodAggregator } from '../../rendering/lineLod';

const WIDTH = 800;
const HEIGHT = 540;

function makeQuantumSnapshot(
  siteCount: number,
  realAmplitude: number,
  imaginaryAmplitude: number,
  spikes?: { realIndex?: number; realValue?: number; imagIndex?: number; imagValue?: number },
): Quantum1DPeriodicSnapshot {
  const amplitudeReal = new Float64Array(siteCount);
  const amplitudeImaginary = new Float64Array(siteCount);
  const magnitude = new Float64Array(siteCount);
  const probabilityDensity = new Float64Array(siteCount);
  for (let index = 0; index < siteCount; index += 1) {
    amplitudeReal[index] = realAmplitude * Math.cos((2 * Math.PI * index) / siteCount);
    amplitudeImaginary[index] = imaginaryAmplitude * Math.sin((2 * Math.PI * index) / siteCount);
  }
  if (spikes?.realIndex !== undefined) {
    amplitudeReal[spikes.realIndex] = spikes.realValue ?? 1;
  }
  if (spikes?.imagIndex !== undefined) {
    amplitudeImaginary[spikes.imagIndex] = spikes.imagValue ?? 1;
  }
  for (let index = 0; index < siteCount; index += 1) {
    const p =
      amplitudeReal[index] * amplitudeReal[index] +
      amplitudeImaginary[index] * amplitudeImaginary[index];
    probabilityDensity[index] = p;
    magnitude[index] = Math.sqrt(p);
  }
  return {
    kind: 'quantum-1d-periodic',
    time: 0,
    systemLabel: '1D circle',
    boundaryCondition: 'periodic',
    modeLabel: 'free-field one-particle',
    quantity: 'real-imaginary-parts',
    siteCount,
    domainLength: 1,
    spacing: 1 / siteCount,
    amplitudeReal,
    amplitudeImaginary,
    magnitude,
    probabilityDensity,
    modeWeights: new Float64Array(siteCount),
    totalNorm: 1,
  };
}

const ringOptions = {
  showLattice: false,
  showSprings: false,
  quantity: 'real-imaginary-parts',
  oneDView: 'ring',
} as const;

describe('combined Re/Im view rendering', () => {
  it('uses one shared symmetric scale from max(|Re|, |Im|)', () => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));

    // Im dominates: the shared scale must come from the imaginary channel.
    const info = renderer.renderScene(
      makeQuantumSnapshot(128, 0.4, 0.9),
      { ...ringOptions, scaleMode: 'normalize' },
      WIDTH,
      HEIGHT,
    );

    expect(info.signed).toBe(true);
    expect(info.scaleMax).toBeCloseTo(0.9, 6);
    renderer.destroy();
  });

  it('fixed scaling does not shrink when either channel falls in amplitude', () => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));

    const first = renderer.renderScene(
      makeQuantumSnapshot(128, 0.4, 0.9),
      { ...ringOptions, scaleMode: 'fixed' },
      WIDTH,
      HEIGHT,
    );
    const second = renderer.renderScene(
      makeQuantumSnapshot(128, 0.1, 0.2),
      { ...ringOptions, scaleMode: 'fixed' },
      WIDTH,
      HEIGHT,
    );

    expect(first.scaleMax).toBeCloseTo(0.9, 6);
    expect(second.scaleMax).toBeCloseTo(0.9, 6);
    renderer.destroy();
  });

  it('renders both channels (one trace per channel, unlike the single-part views)', () => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));

    renderer.renderScene(makeQuantumSnapshot(128, 0.5, 0.5), ringOptions, WIDTH, HEIGHT);
    const combinedCount = renderer.getPrimitiveInstructionCount();

    renderer.renderScene(
      makeQuantumSnapshot(128, 0.5, 0.5),
      { ...ringOptions, quantity: 'real-part' },
      WIDTH,
      HEIGHT,
    );
    const singleCount = renderer.getPrimitiveInstructionCount();

    expect(combinedCount).toBeGreaterThan(singleCount);
    renderer.destroy();
  });

  it('bounds the rendered primitive count at 2048 sites', () => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));

    renderer.renderScene(makeQuantumSnapshot(2048, 0.5, 0.5), ringOptions, WIDTH, HEIGHT);
    const countAt2048 = renderer.getPrimitiveInstructionCount();

    renderer.renderScene(makeQuantumSnapshot(4096, 0.5, 0.5), ringOptions, WIDTH, HEIGHT);
    const countAt4096 = renderer.getPrimitiveInstructionCount();

    // Envelope fills + two trace strokes: a small constant, not O(sites).
    expect(countAt2048).toBeLessThan(16);
    expect(countAt4096).toBe(countAt2048);
    renderer.destroy();
  });

  it('keeps guide geometry constant over many combined-ring frames', () => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));

    renderer.renderScene(makeQuantumSnapshot(512, 0.5, 0.5), ringOptions, WIDTH, HEIGHT);
    const initial = renderer.getGuideInstructionCount();
    expect(initial).toBeGreaterThan(0);
    for (let frame = 0; frame < 500; frame += 1) {
      renderer.renderScene(makeQuantumSnapshot(512, 0.5, 0.5), ringOptions, WIDTH, HEIGHT);
    }
    expect(renderer.getGuideInstructionCount()).toBe(initial);
    renderer.destroy();
  });

  it('renders the combined view on the unwrapped plot for the fixed-end interval', () => {
    const renderer = new PeriodicClassicalFieldRenderer(document.createElement('div'));
    const base = makeQuantumSnapshot(129, 0.4, 0.6);
    const snapshot: Quantum1DFixedSnapshot = {
      ...base,
      kind: 'quantum-1d-fixed',
      systemLabel: '1D interval',
      boundaryCondition: 'dirichlet',
    };

    const info = renderer.renderScene(
      snapshot,
      { showLattice: false, showSprings: false, quantity: 'real-imaginary-parts' },
      WIDTH,
      HEIGHT,
    );

    expect(info.signed).toBe(true);
    expect(renderer.getGuideInstructionCount()).toBeGreaterThan(0);
    renderer.destroy();
  });

  it('level-of-detail aggregation preserves extrema independently for both channels', () => {
    const realAggregator = new LineLodAggregator();
    const imagAggregator = new LineLodAggregator();
    const snapshot = makeQuantumSnapshot(2048, 0.1, 0.1, {
      realIndex: 500,
      realValue: 3,
      imagIndex: 1500,
      imagValue: -4,
    });

    const realLod = realAggregator.aggregate(snapshot.amplitudeReal, 256);
    const imagLod = imagAggregator.aggregate(snapshot.amplitudeImaginary, 256);

    expect(Math.max(...Array.from(realLod.max.slice(0, realLod.count)))).toBe(3);
    expect(Math.min(...Array.from(imagLod.min.slice(0, imagLod.count)))).toBe(-4);
  });
});
