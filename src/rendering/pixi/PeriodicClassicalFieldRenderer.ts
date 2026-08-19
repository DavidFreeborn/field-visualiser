import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  Sprite,
  Texture,
} from 'pixi.js';
import type {
  Classical1DPeriodicQuantity,
  Classical1DPeriodicSnapshot,
} from '../../physics/classical/classical1dPeriodic';
import type {
  Classical1DFixedQuantity,
  Classical1DFixedSnapshot,
} from '../../physics/classical/classical1dFixed';
import type {
  Classical2DQuantity,
  Classical2DSnapshot,
} from '../../physics/classical/classical2d';
import type {
  Quantum1DPeriodicQuantity,
  Quantum1DPeriodicSnapshot,
} from '../../physics/quantum/quantum1dPeriodic';
import type {
  Quantum1DFixedQuantity,
  Quantum1DFixedSnapshot,
} from '../../physics/quantum/quantum1dFixed';
import type { Quantum2DPeriodicQuantity } from '../../physics/quantum/quantum2dPeriodic';
import type { Quantum2DFixedQuantity } from '../../physics/quantum/quantum2dFixed';
import type { Quantum2DDisplaySnapshot } from '../../physics/quantum/quantum2dDisplay';
import {
  mapDensityToSequentialNumber,
  mapPhaseMagnitudeToNumber,
  mapSignedValueToDivergingNumber,
} from '../colorMaps';
import { computePixelBudget, LineLodAggregator } from '../lineLod';

export type RendererQuantity =
  | Classical1DPeriodicQuantity
  | Classical1DFixedQuantity
  | Classical2DQuantity
  | Quantum1DPeriodicQuantity
  | Quantum1DFixedQuantity
  | Quantum2DPeriodicQuantity
  | Quantum2DFixedQuantity;

export interface PeriodicClassicalFieldRendererOptions {
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly circleLayout?: 'radial' | 'longitudinal';
  readonly circleGeometryMode?: 'deformed' | 'fixed';
  /**
   * 1D representation for periodic systems: 'ring' (default) shows the
   * periodic topology on a circle; 'plot' is the optional unwrapped
   * position-vs-value analysis view. Fixed-interval snapshots always render
   * as a plot.
   */
  readonly oneDView?: 'plot' | 'ring';
  /**
   * Value-to-color/height mapping: 'fixed' holds the scale (auto-growing to
   * fit, never shrinking) so amplitudes are comparable across frames;
   * 'normalize' rescales every frame to the current extremum. Defaults:
   * signed quantities 'fixed', non-negative quantities 'normalize'.
   */
  readonly scaleMode?: 'fixed' | 'normalize';
  readonly quantity: RendererQuantity;
}

/** The actual numeric mapping used for the frame, for legends. */
export interface RenderFrameInfo {
  readonly scaleMax: number;
  readonly scaleMode: 'fixed' | 'normalize';
  readonly signed: boolean;
  readonly phase: boolean;
}

type RendererSnapshot =
  | Classical1DPeriodicSnapshot
  | Classical1DFixedSnapshot
  | Classical2DSnapshot
  | Quantum1DPeriodicSnapshot
  | Quantum1DFixedSnapshot
  | Quantum2DDisplaySnapshot;

type Quantum1DSnapshot = Quantum1DPeriodicSnapshot | Quantum1DFixedSnapshot;

const PLOT_MARGIN_X = 20;
const PLOT_MARGIN_Y = 24;
/**
 * Ring sizing: the ring (including its deformation range) fills 80-88% of the
 * largest inscribed square, leaving margin for antialiasing and displacement.
 */
const RING_BASE_RADIUS_FRACTION = 0.36;
const RING_RADIAL_SCALE_FRACTION = 0.075;
const RING_TANGENTIAL_SCALE_FRACTION = 0.06;
const FIXED_RING_RADIUS_FRACTION = 0.41;
/** Colorblind-safe pair for the combined Re/Im view (ColorBrewer RdYlBu ends). */
const REAL_TRACE_COLOR = 0x2166ac;
const IMAGINARY_TRACE_COLOR = 0xe08214;
const HEATMAP_MARGIN = 10;
const MAX_HEATMAP_PIXELS = 180_000;
const MIN_HEATMAP_AXIS = 24;
const MAX_1D_SITE_DOTS = 256;
const RING_GEOMETRY_SEGMENTS = 256;
const PHASE_STRIP_HEIGHT = 16;
const LATTICE_2D_MIN_CELL_PX = 7;
const TARGET_FRAME_TIME_MS = 14;
const FRAME_TIME_LOWER_BOUND_MS = 10;
const ADAPTIVE_QUALITY_MIN = 0.45;
const ADAPTIVE_QUALITY_STEP = 0.08;

export class PeriodicClassicalFieldRenderer {
  private readonly host: HTMLElement;

  private readonly app = new Application();

  private readonly root = new Container();

  private readonly background = new Graphics();

  private readonly heatmap = new Sprite();

  private readonly guides = new Graphics();

  private readonly envelope = new Graphics();

  private readonly bonds = new Graphics();

  private readonly waveform = new Graphics();

  private readonly masses = new Graphics();

  private ringMesh: Mesh | null = null;

  private ringPositions = new Float32Array(0);

  private ringGeometryKey = '';

  private ringTexture: Texture<BufferImageSource> | null = null;

  private ringSource: BufferImageSource | null = null;

  private ringPixels = new Uint8Array(0);

  private stripSprite: Sprite | null = null;

  private stripTexture: Texture<BufferImageSource> | null = null;

  private stripSource: BufferImageSource | null = null;

  private stripPixels = new Uint8Array(0);

  private initialised = false;

  private presentable = false;

  private lastBackgroundKey = '';

  private lastGuideKey = '';

  private heatmapTexture: Texture<BufferImageSource> | null = null;

  private heatmapSource: BufferImageSource | null = null;

  private heatmapPixels = new Uint8Array(0);

  private downsampleAccum = new Float64Array(0);

  private downsampleCounts = new Uint32Array(0);

  private downsampleAuxAccum = new Float64Array(0);

  private adaptiveQuality = 1;

  private smoothedRenderTimeMs = 0;

  private readonly valueLod = new LineLodAggregator();

  private readonly realLod = new LineLodAggregator();

  private readonly imaginaryLod = new LineLodAggregator();

  private scaleKey = '';

  private retainedScaleMax = 0;

  private readonly resolution =
    typeof window === 'undefined'
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);

  public constructor(host: HTMLElement) {
    this.host = host;
    this.heatmap.visible = false;
    this.root.addChild(
      this.background,
      this.heatmap,
      this.guides,
      this.envelope,
      this.bonds,
      this.waveform,
      this.masses,
    );
  }

  public async init(): Promise<void> {
    await this.app.init({
      antialias: true,
      backgroundAlpha: 0,
      resizeTo: this.host,
      // Rendering resolution is capped at 2x: beyond that the extra device
      // pixels add cost without visible benefit for these plots.
      resolution: this.resolution,
    });

    this.host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.root);
    this.initialised = true;
    this.presentable = true;
  }

  public render(
    snapshot: RendererSnapshot,
    options: PeriodicClassicalFieldRendererOptions,
  ): RenderFrameInfo | null {
    if (!this.initialised) {
      return null;
    }

    const info = this.renderScene(
      snapshot,
      options,
      this.host.clientWidth,
      this.host.clientHeight,
    );

    if (this.presentable) {
      this.app.render();
    }

    return info;
  }

  /**
   * Builds the full display list for one frame without presenting it.
   * Public so tests can drive the renderer headlessly with an explicit
   * viewport size.
   */
  public renderScene(
    snapshot: RendererSnapshot,
    options: PeriodicClassicalFieldRendererOptions,
    width: number,
    height: number,
  ): RenderFrameInfo {
    if (
      snapshot.kind === 'classical-2d' ||
      snapshot.kind === 'quantum-2d-display'
    ) {
      return this.render2D(snapshot, width, height, options);
    }

    this.heatmap.visible = false;
    this.setRingMeshVisible(false);

    const isQuantum =
      snapshot.kind === 'quantum-1d-periodic' ||
      snapshot.kind === 'quantum-1d-fixed';
    const phaseView = options.quantity === 'phase-magnitude' && isQuantum;
    const combinedView =
      options.quantity === 'real-imaginary-parts' && isQuantum;
    const periodic = snapshot.boundaryCondition === 'periodic';
    // The circle is the primary representation of periodic topology; the
    // unwrapped plot must be requested explicitly.
    const useRing = periodic && options.oneDView !== 'plot';

    if (useRing) {
      if (combinedView) {
        // Re/Im traces are radial displacements around the fixed base circle,
        // for both circle geometries.
        return this.renderCombinedRing(
          snapshot as Quantum1DSnapshot,
          width,
          height,
          options,
        );
      }
      if (options.circleGeometryMode === 'fixed') {
        return this.renderFixedRing(
          snapshot,
          width,
          height,
          options,
          phaseView,
        );
      }
      return this.renderDeformedRing(
        snapshot,
        width,
        height,
        options,
        phaseView,
      );
    }

    if (combinedView) {
      return this.renderCombinedPlot(
        snapshot as Quantum1DSnapshot,
        width,
        height,
        options,
        periodic,
      );
    }

    return this.renderLinePlot(
      snapshot,
      width,
      height,
      options,
      phaseView,
      periodic,
    );
  }

  public destroy(): void {
    this.destroyHeatmapResources();
    this.destroyRingResources();
    this.destroyStripResources();
    if (this.initialised) {
      this.app.destroy(undefined, { children: true });
    }
    this.initialised = false;
    this.presentable = false;
  }

  /** Number of retained drawing instructions in the guide layer (test hook). */
  public getGuideInstructionCount(): number {
    return this.guides.context.instructions.length;
  }

  /**
   * Number of retained FILL instructions in the envelope layer (test hook).
   * Ring envelopes must be stroked, never filled: filling the closed
   * ring-band polygon triangulates pathologically at high bin counts.
   */
  public getEnvelopeFillInstructionCount(): number {
    return this.envelope.context.instructions.filter(
      (instruction) => instruction.action === 'fill',
    ).length;
  }

  /** Total retained instructions across dynamic layers (test hook). */
  public getPrimitiveInstructionCount(): number {
    return (
      this.waveform.context.instructions.length +
      this.envelope.context.instructions.length +
      this.bonds.context.instructions.length +
      this.masses.context.instructions.length +
      (this.ringMesh !== null && this.ringMesh.visible ? 1 : 0) +
      (this.heatmap.visible ? 1 : 0) +
      (this.stripSprite !== null && this.stripSprite.visible ? 1 : 0)
    );
  }

  // -------------------------------------------------------------------------
  // Scale handling
  // -------------------------------------------------------------------------

  private resolveScale(
    snapshot: RendererSnapshot,
    options: PeriodicClassicalFieldRendererOptions,
    frameMax: number,
    signed: boolean,
    phase: boolean,
  ): RenderFrameInfo {
    const scaleMode = options.scaleMode ?? (signed ? 'fixed' : 'normalize');
    const key = `${snapshot.kind}:${options.quantity}:${getSiteCountKey(snapshot)}:${scaleMode}`;

    if (key !== this.scaleKey) {
      this.scaleKey = key;
      this.retainedScaleMax = frameMax;
    }

    let scaleMax: number;
    if (scaleMode === 'fixed') {
      // Fixed scale: hold the mapping steady; grow only if the field exceeds
      // it (never clip), never shrink back.
      this.retainedScaleMax = Math.max(this.retainedScaleMax, frameMax);
      scaleMax = this.retainedScaleMax;
    } else {
      scaleMax = frameMax;
    }

    return {
      scaleMax: scaleMax || 1,
      scaleMode,
      signed,
      phase,
    };
  }

  // -------------------------------------------------------------------------
  // 1D unwrapped plot
  // -------------------------------------------------------------------------

  private renderLinePlot(
    snapshot: Exclude<
      RendererSnapshot,
      Classical2DSnapshot | Quantum2DDisplaySnapshot
    >,
    width: number,
    height: number,
    options: PeriodicClassicalFieldRendererOptions,
    phaseView: boolean,
    periodic: boolean,
  ): RenderFrameInfo {
    const innerWidth = Math.max(1, width - 2 * PLOT_MARGIN_X);
    const innerHeight = Math.max(1, height - 2 * PLOT_MARGIN_Y);
    const budget = computePixelBudget(innerWidth, this.resolution);

    this.drawBackground(width, height);
    this.waveform.clear();
    this.envelope.clear();
    this.bonds.clear();
    this.masses.clear();

    if (phaseView) {
      return this.renderPhasePlot(
        snapshot as Quantum1DSnapshot,
        width,
        height,
        options,
        innerWidth,
        innerHeight,
        budget,
        periodic,
      );
    }

    this.setStripVisible(false);
    const values = getDisplayedValues(snapshot, options.quantity);
    const signed = !usesSequentialMap(options.quantity);
    const frameMax = getMaxMagnitude(values);
    const info = this.resolveScale(snapshot, options, frameMax, signed, false);
    const lod = this.valueLod.aggregate(values, budget);

    const baseline = signed
      ? PLOT_MARGIN_Y + innerHeight / 2
      : PLOT_MARGIN_Y + innerHeight;
    const amplitudePx = signed ? innerHeight * 0.46 : innerHeight * 0.92;

    this.drawGuides(
      `plot:${width}:${height}:${signed ? 'mid' : 'base'}:${periodic ? 'p' : 'f'}`,
      (guides) => {
        guides
          .rect(PLOT_MARGIN_X, PLOT_MARGIN_Y, innerWidth, innerHeight)
          .stroke({ width: 1, color: 0xc9c2b8, alpha: 0.7 });
        guides
          .moveTo(PLOT_MARGIN_X, baseline)
          .lineTo(PLOT_MARGIN_X + innerWidth, baseline)
          .stroke({ width: 1, color: 0x9ea6b0, alpha: 0.6 });

        if (periodic) {
          drawWraparoundBadge(
            guides,
            width - PLOT_MARGIN_X - 14,
            PLOT_MARGIN_Y + 12,
          );
        }
      },
    );

    const xAt = (binIndex: number): number =>
      PLOT_MARGIN_X + (innerWidth * binIndex) / Math.max(1, lod.count - 1);
    const yAt = (value: number): number =>
      baseline - (value / info.scaleMax) * amplitudePx;

    if (signed) {
      if (lod.binned) {
        // Min/max envelope band so narrow peaks survive aggregation.
        this.envelope.moveTo(xAt(0), yAt(lod.max[0]));
        for (let bin = 1; bin < lod.count; bin += 1) {
          this.envelope.lineTo(xAt(bin), yAt(lod.max[bin]));
        }
        for (let bin = lod.count - 1; bin >= 0; bin -= 1) {
          this.envelope.lineTo(xAt(bin), yAt(lod.min[bin]));
        }
        this.envelope.closePath().fill({ color: 0x53687d, alpha: 0.3 });
      }

      this.waveform.moveTo(xAt(0), yAt(lod.mean[0]));
      for (let bin = 1; bin < lod.count; bin += 1) {
        this.waveform.lineTo(xAt(bin), yAt(lod.mean[bin]));
      }
      this.waveform.stroke({ width: 1.4, color: 0x18222c, alpha: 0.95 });
    } else {
      // Non-negative quantity: filled mean trace (mean conserves the shown
      // integral under equal bins) plus a max outline preserving peaks.
      this.envelope.moveTo(xAt(0), baseline);
      for (let bin = 0; bin < lod.count; bin += 1) {
        this.envelope.lineTo(xAt(bin), yAt(lod.mean[bin]));
      }
      this.envelope.lineTo(xAt(lod.count - 1), baseline);
      this.envelope.closePath().fill({ color: 0xc14f37, alpha: 0.42 });

      this.waveform.moveTo(xAt(0), yAt(lod.max[0]));
      for (let bin = 1; bin < lod.count; bin += 1) {
        this.waveform.lineTo(xAt(bin), yAt(lod.max[bin]));
      }
      this.waveform.stroke({ width: 1.2, color: 0x8f1f1f, alpha: 0.9 });
    }

    if (
      options.showLattice &&
      values.length <= MAX_1D_SITE_DOTS &&
      !lod.binned
    ) {
      const siteRadius = get1DSiteRadius(values.length);
      for (let index = 0; index < values.length; index += 1) {
        const color = signed
          ? mapSignedValueToDivergingNumber(values[index], info.scaleMax)
          : mapDensityToSequentialNumber(values[index], info.scaleMax);
        // Dots sit beneath the trace so the line stays continuous.
        this.bonds
          .circle(xAt(index), yAt(values[index]), siteRadius)
          .fill({ color, alpha: 0.95 });
      }
    }

    if (
      options.showSprings &&
      !lod.binned &&
      values.length <= MAX_1D_SITE_DOTS &&
      signed
    ) {
      const bondWidth = get1DBondWidth(values.length);
      for (let index = 0; index < values.length - 1; index += 1) {
        this.bonds
          .moveTo(xAt(index), yAt(values[index]))
          .lineTo(xAt(index + 1), yAt(values[index + 1]))
          .stroke({ width: bondWidth, color: 0x5d6772, alpha: 0.28 });
      }
    }

    return info;
  }

  private renderPhasePlot(
    snapshot: Quantum1DSnapshot,
    width: number,
    height: number,
    options: PeriodicClassicalFieldRendererOptions,
    innerWidth: number,
    innerHeight: number,
    budget: number,
    periodic: boolean,
  ): RenderFrameInfo {
    const realLod = this.realLod.aggregate(snapshot.amplitudeReal, budget);
    const imagLod = this.imaginaryLod.aggregate(
      snapshot.amplitudeImaginary,
      budget,
    );
    const count = Math.min(realLod.count, imagLod.count);

    let frameMax = 0;
    for (let bin = 0; bin < count; bin += 1) {
      frameMax = Math.max(
        frameMax,
        Math.hypot(realLod.mean[bin], imagLod.mean[bin]),
      );
    }
    const info = this.resolveScale(snapshot, options, frameMax, false, true);

    const stripTop = PLOT_MARGIN_Y + innerHeight - PHASE_STRIP_HEIGHT;
    const curveHeight = innerHeight - PHASE_STRIP_HEIGHT - 8;

    this.drawGuides(
      `phase:${width}:${height}:${periodic ? 'p' : 'f'}`,
      (guides) => {
        guides
          .rect(PLOT_MARGIN_X, PLOT_MARGIN_Y, innerWidth, innerHeight)
          .stroke({ width: 1, color: 0xc9c2b8, alpha: 0.7 });
        guides
          .rect(PLOT_MARGIN_X, stripTop, innerWidth, PHASE_STRIP_HEIGHT)
          .stroke({ width: 1, color: 0xc9c2b8, alpha: 0.7 });
        if (periodic) {
          drawWraparoundBadge(
            guides,
            width - PLOT_MARGIN_X - 14,
            PLOT_MARGIN_Y + 12,
          );
        }
      },
    );

    // Phase heat strip: one texel per bin, hue = phase, fade = magnitude.
    this.ensureStripTexture(count);
    for (let bin = 0; bin < count; bin += 1) {
      const magnitude = Math.hypot(realLod.mean[bin], imagLod.mean[bin]);
      const phase = Math.atan2(imagLod.mean[bin], realLod.mean[bin]);
      writeColorToPixelBuffer(
        this.stripPixels,
        bin * 4,
        mapPhaseMagnitudeToNumber(phase, magnitude, info.scaleMax),
      );
    }
    if (
      this.stripSource !== null &&
      this.stripSprite !== null &&
      this.stripTexture !== null
    ) {
      this.stripSource.update();
      this.stripSprite.texture = this.stripTexture;
      this.stripSprite.visible = true;
      this.stripSprite.x = PLOT_MARGIN_X;
      this.stripSprite.y = stripTop;
      this.stripSprite.width = innerWidth;
      this.stripSprite.height = PHASE_STRIP_HEIGHT;
    }

    // Magnitude curve above the strip.
    const xAt = (binIndex: number): number =>
      PLOT_MARGIN_X + (innerWidth * binIndex) / Math.max(1, count - 1);
    const yAt = (magnitude: number): number =>
      stripTop - 8 - (magnitude / info.scaleMax) * curveHeight * 0.92;

    this.waveform.moveTo(
      xAt(0),
      yAt(Math.hypot(realLod.mean[0], imagLod.mean[0])),
    );
    for (let bin = 1; bin < count; bin += 1) {
      this.waveform.lineTo(
        xAt(bin),
        yAt(Math.hypot(realLod.mean[bin], imagLod.mean[bin])),
      );
    }
    this.waveform.stroke({ width: 1.4, color: 0x18222c, alpha: 0.9 });

    return info;
  }

  // -------------------------------------------------------------------------
  // Combined Re/Im views (1D quantum only)
  // -------------------------------------------------------------------------

  /**
   * Shared symmetric scale for the combined view: one scale from
   * max(|Re psi|, |Im psi|), so the channels are directly comparable and are
   * never normalized independently.
   */
  private resolveCombinedScale(
    snapshot: Quantum1DSnapshot,
    options: PeriodicClassicalFieldRendererOptions,
  ): RenderFrameInfo {
    const frameMax = Math.max(
      getMaxMagnitude(snapshot.amplitudeReal),
      getMaxMagnitude(snapshot.amplitudeImaginary),
    );
    return this.resolveScale(snapshot, options, frameMax, true, false);
  }

  /**
   * Draws a mean-value trace, dashed when requested. Dashing is built from
   * subpaths inside ONE stroke instruction, so the primitive count stays
   * bounded by the pixel budget regardless of lattice size.
   */
  private strokeTrace(
    layer: Graphics,
    count: number,
    pointAt: (bin: number) => { x: number; y: number },
    color: number,
    lineWidth: number,
    dashed: boolean,
    closed: boolean,
  ): void {
    if (count < 2) {
      return;
    }

    if (!dashed) {
      const start = pointAt(0);
      layer.moveTo(start.x, start.y);
      for (let bin = 1; bin < count; bin += 1) {
        const point = pointAt(bin);
        layer.lineTo(point.x, point.y);
      }
      if (closed) {
        layer.closePath();
      }
      layer.stroke({ width: lineWidth, color, alpha: 0.95 });
      return;
    }

    // Dash pattern in bin units (bins are ~1 device pixel wide at budget).
    const DASH_ON = 6;
    const DASH_PERIOD = 9;
    let penDown = false;
    const total = closed ? count + 1 : count;
    for (let step = 0; step < total; step += 1) {
      const bin = step % count;
      if (step % DASH_PERIOD < DASH_ON) {
        const point = pointAt(bin);
        if (penDown) {
          layer.lineTo(point.x, point.y);
        } else {
          layer.moveTo(point.x, point.y);
          penDown = true;
        }
      } else {
        penDown = false;
      }
    }
    layer.stroke({ width: lineWidth, color, alpha: 0.95 });
  }

  private drawChannelEnvelope(
    count: number,
    minAt: (bin: number) => { x: number; y: number },
    maxAt: (bin: number) => { x: number; y: number },
    color: number,
    ring = false,
  ): void {
    if (ring) {
      // On ring geometry the min/max envelope is drawn as two closed stroked
      // outlines. Filling the closed ring-band polygon triangulates
      // pathologically in Pixi at high bin counts (~1.5 s per frame at 2048
      // sites), while strokes of the same vertex count render in
      // microseconds.
      this.strokeEnvelopeLoop(count, maxAt, color);
      this.strokeEnvelopeLoop(count, minAt, color);
      return;
    }

    const first = maxAt(0);
    this.envelope.moveTo(first.x, first.y);
    for (let bin = 1; bin < count; bin += 1) {
      const point = maxAt(bin);
      this.envelope.lineTo(point.x, point.y);
    }
    for (let bin = count - 1; bin >= 0; bin -= 1) {
      const point = minAt(bin);
      this.envelope.lineTo(point.x, point.y);
    }
    this.envelope.closePath().fill({ color, alpha: 0.15 });
  }

  private strokeEnvelopeLoop(
    count: number,
    pointAt: (bin: number) => { x: number; y: number },
    color: number,
    alpha = 0.4,
  ): void {
    const first = pointAt(0);
    this.envelope.moveTo(first.x, first.y);
    for (let bin = 1; bin < count; bin += 1) {
      const point = pointAt(bin);
      this.envelope.lineTo(point.x, point.y);
    }
    this.envelope.closePath().stroke({ width: 1, color, alpha });
  }

  private renderCombinedRing(
    snapshot: Quantum1DSnapshot,
    width: number,
    height: number,
    options: PeriodicClassicalFieldRendererOptions,
  ): RenderFrameInfo {
    this.drawBackground(width, height);
    this.waveform.clear();
    this.envelope.clear();
    this.bonds.clear();
    this.masses.clear();
    this.setStripVisible(false);
    this.setRingMeshVisible(false);

    const centerX = width / 2;
    const centerY = height / 2;
    const minDimension = Math.min(width, height);
    const baseRadius = Math.max(32, minDimension * RING_BASE_RADIUS_FRACTION);
    const radialScale = minDimension * RING_RADIAL_SCALE_FRACTION;
    const budget = computePixelBudget(
      2 * Math.PI * baseRadius,
      this.resolution,
    );

    // The undeformed domain circle is the shared zero baseline: visible but
    // visually subordinate to the traces.
    this.drawGuides(
      `circle-combined:${width}:${height}:${baseRadius.toFixed(1)}`,
      (guides) => {
        guides
          .circle(centerX, centerY, baseRadius)
          .stroke({ width: 1.2, color: 0x8b939e, alpha: 0.6 });
      },
    );

    const realLod = this.realLod.aggregate(snapshot.amplitudeReal, budget);
    const imagLod = this.imaginaryLod.aggregate(
      snapshot.amplitudeImaginary,
      budget,
    );
    const count = Math.min(realLod.count, imagLod.count);
    const info = this.resolveCombinedScale(snapshot, options);

    const pointFor = (bin: number, value: number): { x: number; y: number } => {
      const angle = -Math.PI / 2 + (2 * Math.PI * bin) / count;
      const radius = baseRadius + (value / info.scaleMax) * radialScale;
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    };

    if (realLod.binned) {
      this.drawChannelEnvelope(
        count,
        (bin) => pointFor(bin, realLod.min[bin]),
        (bin) => pointFor(bin, realLod.max[bin]),
        REAL_TRACE_COLOR,
        true,
      );
    }
    if (imagLod.binned) {
      this.drawChannelEnvelope(
        count,
        (bin) => pointFor(bin, imagLod.min[bin]),
        (bin) => pointFor(bin, imagLod.max[bin]),
        IMAGINARY_TRACE_COLOR,
        true,
      );
    }

    // Re: solid, drawn first; Im: dashed on top, so both remain identifiable
    // where they overlap (color is still the primary distinction).
    this.strokeTrace(
      this.waveform,
      count,
      (bin) => pointFor(bin, realLod.mean[bin]),
      REAL_TRACE_COLOR,
      1.9,
      false,
      true,
    );
    this.strokeTrace(
      this.masses,
      count,
      (bin) => pointFor(bin, imagLod.mean[bin]),
      IMAGINARY_TRACE_COLOR,
      1.7,
      true,
      true,
    );

    return info;
  }

  private renderCombinedPlot(
    snapshot: Quantum1DSnapshot,
    width: number,
    height: number,
    options: PeriodicClassicalFieldRendererOptions,
    periodic: boolean,
  ): RenderFrameInfo {
    this.drawBackground(width, height);
    this.waveform.clear();
    this.envelope.clear();
    this.bonds.clear();
    this.masses.clear();
    this.setStripVisible(false);
    this.setRingMeshVisible(false);

    const innerWidth = Math.max(1, width - 2 * PLOT_MARGIN_X);
    const innerHeight = Math.max(1, height - 2 * PLOT_MARGIN_Y);
    const budget = computePixelBudget(innerWidth, this.resolution);
    const baseline = PLOT_MARGIN_Y + innerHeight / 2;
    const amplitudePx = innerHeight * 0.46;

    this.drawGuides(
      `plot-combined:${width}:${height}:${periodic ? 'p' : 'f'}`,
      (guides) => {
        guides
          .rect(PLOT_MARGIN_X, PLOT_MARGIN_Y, innerWidth, innerHeight)
          .stroke({ width: 1, color: 0xc9c2b8, alpha: 0.7 });
        guides
          .moveTo(PLOT_MARGIN_X, baseline)
          .lineTo(PLOT_MARGIN_X + innerWidth, baseline)
          .stroke({ width: 1, color: 0x9ea6b0, alpha: 0.6 });
        if (periodic) {
          drawWraparoundBadge(
            guides,
            width - PLOT_MARGIN_X - 14,
            PLOT_MARGIN_Y + 12,
          );
        }
      },
    );

    const realLod = this.realLod.aggregate(snapshot.amplitudeReal, budget);
    const imagLod = this.imaginaryLod.aggregate(
      snapshot.amplitudeImaginary,
      budget,
    );
    const count = Math.min(realLod.count, imagLod.count);
    const info = this.resolveCombinedScale(snapshot, options);

    const pointFor = (
      bin: number,
      value: number,
    ): { x: number; y: number } => ({
      x: PLOT_MARGIN_X + (innerWidth * bin) / Math.max(1, count - 1),
      y: baseline - (value / info.scaleMax) * amplitudePx,
    });

    if (realLod.binned) {
      this.drawChannelEnvelope(
        count,
        (bin) => pointFor(bin, realLod.min[bin]),
        (bin) => pointFor(bin, realLod.max[bin]),
        REAL_TRACE_COLOR,
      );
    }
    if (imagLod.binned) {
      this.drawChannelEnvelope(
        count,
        (bin) => pointFor(bin, imagLod.min[bin]),
        (bin) => pointFor(bin, imagLod.max[bin]),
        IMAGINARY_TRACE_COLOR,
      );
    }

    this.strokeTrace(
      this.waveform,
      count,
      (bin) => pointFor(bin, realLod.mean[bin]),
      REAL_TRACE_COLOR,
      1.9,
      false,
      false,
    );
    this.strokeTrace(
      this.masses,
      count,
      (bin) => pointFor(bin, imagLod.mean[bin]),
      IMAGINARY_TRACE_COLOR,
      1.7,
      true,
      false,
    );

    return info;
  }

  // -------------------------------------------------------------------------
  // 1D ring views
  // -------------------------------------------------------------------------

  private renderDeformedRing(
    snapshot: Exclude<
      RendererSnapshot,
      Classical2DSnapshot | Quantum2DDisplaySnapshot
    >,
    width: number,
    height: number,
    options: PeriodicClassicalFieldRendererOptions,
    phaseView: boolean,
  ): RenderFrameInfo {
    this.drawBackground(width, height);
    this.waveform.clear();
    this.envelope.clear();
    this.bonds.clear();
    this.masses.clear();
    this.setStripVisible(false);

    const centerX = width / 2;
    const centerY = height / 2;
    const minDimension = Math.min(width, height);
    const baseRadius = Math.max(32, minDimension * RING_BASE_RADIUS_FRACTION);
    const radialScale = minDimension * RING_RADIAL_SCALE_FRACTION;
    const tangentialScale = minDimension * RING_TANGENTIAL_SCALE_FRACTION;

    // Ring pixel budget from the on-screen circumference.
    const budget = computePixelBudget(
      2 * Math.PI * baseRadius,
      this.resolution,
    );

    const quantity = phaseView ? 'magnitude' : options.quantity;
    const values = getDisplayedValues(snapshot, quantity);
    const signed = !phaseView && !usesSequentialMap(quantity);
    const frameMax = getMaxMagnitude(values);
    const info = this.resolveScale(
      snapshot,
      options,
      frameMax,
      signed,
      phaseView,
    );
    const lod = this.valueLod.aggregate(values, budget);
    const useLongitudinal = options.circleLayout === 'longitudinal' && signed;

    this.drawGuides(
      `circle:${width}:${height}:${baseRadius.toFixed(1)}`,
      (guides) => {
        guides
          .circle(centerX, centerY, baseRadius)
          .stroke({ width: 1, color: 0x9ea6b0, alpha: 0.45 });
      },
    );

    const pointAt = (bin: number, value: number): { x: number; y: number } => {
      const angle = -Math.PI / 2 + (2 * Math.PI * bin) / lod.count;
      if (useLongitudinal) {
        const angleOffset =
          ((value / info.scaleMax) * tangentialScale) / baseRadius;
        return {
          x: centerX + Math.cos(angle + angleOffset) * baseRadius,
          y: centerY + Math.sin(angle + angleOffset) * baseRadius,
        };
      }
      const offset = signed
        ? (value / info.scaleMax) * radialScale
        : Math.max(0, value / info.scaleMax) * radialScale;
      return {
        x: centerX + Math.cos(angle) * (baseRadius + offset),
        y: centerY + Math.sin(angle) * (baseRadius + offset),
      };
    };

    if (lod.binned && !useLongitudinal) {
      // Min/max envelope as two closed stroked outlines. Filling the closed
      // ring-band polygon triangulates pathologically in Pixi at high bin
      // counts (~1.5 s per frame at 2048 sites); strokes preserve the same
      // envelope information at negligible cost.
      const bandColor = signed ? 0x53687d : 0xc14f37;
      this.strokeEnvelopeLoop(
        lod.count,
        (bin) => pointAt(bin, lod.max[bin]),
        bandColor,
        0.45,
      );
      this.strokeEnvelopeLoop(
        lod.count,
        (bin) => pointAt(bin, lod.min[bin]),
        bandColor,
        0.45,
      );
    }

    const start = pointAt(0, lod.mean[0]);
    this.waveform.moveTo(start.x, start.y);
    for (let bin = 1; bin < lod.count; bin += 1) {
      const point = pointAt(bin, lod.mean[bin]);
      this.waveform.lineTo(point.x, point.y);
    }
    this.waveform
      .closePath()
      .stroke({ width: 1.4, color: 0x18222c, alpha: 0.95 });

    if (
      options.showLattice &&
      values.length <= MAX_1D_SITE_DOTS &&
      !lod.binned
    ) {
      const siteRadius = get1DSiteRadius(values.length);
      for (let index = 0; index < values.length; index += 1) {
        const point = pointAt(index, values[index]);
        const color = signed
          ? mapSignedValueToDivergingNumber(values[index], info.scaleMax)
          : mapDensityToSequentialNumber(values[index], info.scaleMax);
        // Dots sit beneath the trace so the line stays continuous.
        this.bonds
          .circle(point.x, point.y, siteRadius)
          .fill({ color, alpha: 0.95 });
      }
    }

    if (
      options.showSprings &&
      values.length <= MAX_1D_SITE_DOTS &&
      !lod.binned
    ) {
      const bondWidth = get1DBondWidth(values.length);
      for (let index = 0; index < values.length; index += 1) {
        const point = pointAt(index, values[index]);
        const nextIndex = (index + 1) % values.length;
        const nextPoint = pointAt(nextIndex, values[nextIndex]);
        this.bonds
          .moveTo(point.x, point.y)
          .lineTo(nextPoint.x, nextPoint.y)
          .stroke({ width: bondWidth, color: 0x5d6772, alpha: 0.24 });
      }
    }

    return info;
  }

  private renderFixedRing(
    snapshot: Exclude<
      RendererSnapshot,
      Classical2DSnapshot | Quantum2DDisplaySnapshot
    >,
    width: number,
    height: number,
    options: PeriodicClassicalFieldRendererOptions,
    phaseView: boolean,
  ): RenderFrameInfo {
    this.drawBackground(width, height);
    this.waveform.clear();
    this.envelope.clear();
    this.bonds.clear();
    this.masses.clear();
    this.setStripVisible(false);

    const centerX = width / 2;
    const centerY = height / 2;
    const minDimension = Math.min(width, height);
    const baseRadius = Math.max(32, minDimension * FIXED_RING_RADIUS_FRACTION);
    const ringWidth = Math.max(10, Math.min(28, minDimension * 0.05));
    const budget = computePixelBudget(
      2 * Math.PI * baseRadius,
      this.resolution,
    );

    this.drawGuides(
      `ring:${width}:${height}:${baseRadius.toFixed(1)}`,
      (guides) => {
        guides
          .circle(centerX, centerY, baseRadius - ringWidth * 0.75)
          .stroke({ width: 1, color: 0x9ea6b0, alpha: 0.3 });
      },
    );

    const signed = !phaseView && !usesSequentialMap(options.quantity);

    let info: RenderFrameInfo;
    let binCount: number;

    if (phaseView) {
      const quantumSnapshot = snapshot as Quantum1DSnapshot;
      const realLod = this.realLod.aggregate(
        quantumSnapshot.amplitudeReal,
        budget,
      );
      const imagLod = this.imaginaryLod.aggregate(
        quantumSnapshot.amplitudeImaginary,
        budget,
      );
      binCount = Math.min(realLod.count, imagLod.count);

      let frameMax = 0;
      for (let bin = 0; bin < binCount; bin += 1) {
        frameMax = Math.max(
          frameMax,
          Math.hypot(realLod.mean[bin], imagLod.mean[bin]),
        );
      }
      info = this.resolveScale(snapshot, options, frameMax, false, true);

      this.ensureRingResources(binCount);
      for (let bin = 0; bin < binCount; bin += 1) {
        const magnitude = Math.hypot(realLod.mean[bin], imagLod.mean[bin]);
        const phase = Math.atan2(imagLod.mean[bin], realLod.mean[bin]);
        writeColorToPixelBuffer(
          this.ringPixels,
          bin * 4,
          mapPhaseMagnitudeToNumber(phase, magnitude, info.scaleMax),
        );
      }
    } else {
      const values = getDisplayedValues(snapshot, options.quantity);
      const frameMax = getMaxMagnitude(values);
      info = this.resolveScale(snapshot, options, frameMax, signed, false);
      const lod = this.valueLod.aggregate(values, budget);
      binCount = lod.count;

      this.ensureRingResources(binCount);
      for (let bin = 0; bin < binCount; bin += 1) {
        // Color by the extremum of the bin (largest |value|) so aggregated
        // narrow peaks stay visible on the ring.
        const extremum =
          Math.abs(lod.max[bin]) >= Math.abs(lod.min[bin])
            ? lod.max[bin]
            : lod.min[bin];
        writeColorToPixelBuffer(
          this.ringPixels,
          bin * 4,
          signed
            ? mapSignedValueToDivergingNumber(extremum, info.scaleMax)
            : mapDensityToSequentialNumber(extremum, info.scaleMax),
        );
      }
    }

    this.updateRingMesh(centerX, centerY, baseRadius, ringWidth);

    if (
      options.showLattice &&
      getSiteCountKey(snapshot) <= MAX_1D_SITE_DOTS &&
      !phaseView
    ) {
      const values = getDisplayedValues(snapshot, options.quantity);
      if (values.length <= MAX_1D_SITE_DOTS) {
        const siteRadius = get1DSiteRadius(values.length);
        for (let index = 0; index < values.length; index += 1) {
          const angle = -Math.PI / 2 + (2 * Math.PI * index) / values.length;
          const color = signed
            ? mapSignedValueToDivergingNumber(values[index], info.scaleMax)
            : mapDensityToSequentialNumber(values[index], info.scaleMax);
          this.bonds
            .circle(
              centerX + Math.cos(angle) * baseRadius,
              centerY + Math.sin(angle) * baseRadius,
              siteRadius,
            )
            .fill({ color, alpha: 0.95 });
        }
      }
    }

    return info;
  }

  // -------------------------------------------------------------------------
  // 2D heatmap
  // -------------------------------------------------------------------------

  private render2D(
    snapshot: Classical2DSnapshot | Quantum2DDisplaySnapshot,
    width: number,
    height: number,
    options: PeriodicClassicalFieldRendererOptions,
  ): RenderFrameInfo {
    const renderStart = performance.now();
    const auxValues =
      snapshot.kind === 'quantum-2d-display' &&
      snapshot.quantity === 'phase-magnitude'
        ? snapshot.displayValuesAux
        : undefined;
    const phaseView = auxValues !== undefined;
    const values = auxValues ?? getDisplayedValues(snapshot, options.quantity);
    const phases =
      phaseView && snapshot.kind === 'quantum-2d-display'
        ? snapshot.displayValues
        : null;
    const signed = !phaseView && !usesSequentialMap(options.quantity);
    const frameMax = getMaxMagnitude(values);
    const info = this.resolveScale(
      snapshot,
      options,
      frameMax,
      signed,
      phaseView,
    );

    const cols = snapshot.width;
    const rows = snapshot.height;

    // Give the heatmap the full canvas at equal spatial aspect: the grids are
    // square, so the drawable area is the largest centred square.
    const side = Math.max(1, Math.min(width, height) - 2 * HEATMAP_MARGIN);
    const offsetX = (width - side) / 2;
    const offsetY = (height - side) / 2;

    this.drawBackground(width, height);
    // 2D views have no guide geometry; this clears any stale 1D circle.
    this.drawGuides('none', () => undefined);
    this.waveform.clear();
    this.envelope.clear();
    this.bonds.clear();
    this.masses.clear();
    this.setRingMeshVisible(false);
    this.setStripVisible(false);

    const displayGrid = selectHeatmapGrid(
      cols,
      rows,
      side,
      side,
      this.adaptiveQuality,
    );
    this.ensureHeatmapTexture(displayGrid.width, displayGrid.height);
    populateHeatmapPixels({
      values,
      phases,
      cols,
      rows,
      targetCols: displayGrid.width,
      targetRows: displayGrid.height,
      scaleMax: info.scaleMax,
      mode: phaseView ? 'phase' : signed ? 'diverging' : 'sequential',
      heatmapPixels: this.heatmapPixels,
      downsampleAccum: this.downsampleAccum,
      downsampleAuxAccum: this.downsampleAuxAccum,
      downsampleCounts: this.downsampleCounts,
    });

    if (this.heatmapSource === null || this.heatmapTexture === null) {
      throw new Error('2D heatmap resources were not initialised.');
    }

    this.heatmapSource.scaleMode =
      displayGrid.width < cols || displayGrid.height < rows
        ? 'linear'
        : 'nearest';
    this.heatmapSource.update();
    this.heatmap.texture = this.heatmapTexture;
    this.heatmap.visible = true;
    this.heatmap.alpha = 1;
    this.heatmap.x = offsetX;
    this.heatmap.y = offsetY;
    this.heatmap.width = side;
    this.heatmap.height = side;

    if (options.showLattice) {
      this.render2DLatticeOverlay(cols, rows, side, offsetX, offsetY);
    }

    this.updateAdaptiveQuality(performance.now() - renderStart);
    return info;
  }

  private render2DLatticeOverlay(
    cols: number,
    rows: number,
    side: number,
    offsetX: number,
    offsetY: number,
  ): void {
    const cellWidth = side / cols;
    const cellHeight = side / rows;

    // Adaptive overlay: skip entirely once markers would crowd the field.
    if (Math.min(cellWidth, cellHeight) < LATTICE_2D_MIN_CELL_PX) {
      return;
    }

    const radius = Math.min(1.6, Math.min(cellWidth, cellHeight) * 0.12);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        this.masses
          .circle(
            offsetX + (x + 0.5) * cellWidth,
            offsetY + (y + 0.5) * cellHeight,
            radius,
          )
          .fill({ color: 0x17202a, alpha: 0.16 });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Chrome, guides, and GPU resources
  // -------------------------------------------------------------------------

  private drawBackground(width: number, height: number): void {
    const key = `${width}:${height}`;
    if (key === this.lastBackgroundKey) {
      return;
    }

    this.lastBackgroundKey = key;
    this.background.clear();
    this.background
      .roundRect(0, 0, width, height, 24)
      .fill({ color: 0xfcfaf7, alpha: 0.92 })
      .stroke({ width: 1, color: 0xd8d1c8, alpha: 1 });
  }

  /**
   * Guide layer lifecycle: static guide geometry is drawn exactly once per
   * guide key. The key encodes the complete guide type and geometry, so
   * switching between plot, ring, and 2D views always clears stale guides,
   * and animation frames never append geometry.
   */
  private drawGuides(key: string, draw: (guides: Graphics) => void): void {
    if (key === this.lastGuideKey) {
      return;
    }

    this.lastGuideKey = key;
    this.guides.clear();
    draw(this.guides);
  }

  private ensureHeatmapTexture(width: number, height: number): void {
    if (
      this.heatmapSource !== null &&
      this.heatmapTexture !== null &&
      this.heatmapSource.resourceWidth === width &&
      this.heatmapSource.resourceHeight === height
    ) {
      return;
    }

    this.destroyHeatmapResources();
    this.heatmapPixels = new Uint8Array(width * height * 4);
    this.downsampleAccum = new Float64Array(width * height);
    this.downsampleAuxAccum = new Float64Array(width * height);
    this.downsampleCounts = new Uint32Array(width * height);
    this.heatmapSource = new BufferImageSource({
      resource: this.heatmapPixels,
      width,
      height,
      alphaMode: 'premultiply-alpha-on-upload',
      antialias: false,
      autoGenerateMipmaps: false,
      autoGarbageCollect: false,
      scaleMode: 'nearest',
      label: 'field-visualiser-heatmap',
    });
    this.heatmapTexture = new Texture({
      source: this.heatmapSource,
      dynamic: true,
      label: 'field-visualiser-heatmap-texture',
    });
  }

  private destroyHeatmapResources(): void {
    this.heatmap.texture = Texture.EMPTY;
    this.heatmapTexture?.destroy(true);
    this.heatmapTexture = null;
    this.heatmapSource = null;
  }

  /**
   * The fixed ring is a single annulus mesh whose colors come from a
   * bins x 1 texture; per-frame work is one texel-buffer write and one
   * texture upload, independent of lattice size.
   */
  private ensureRingResources(binCount: number): void {
    if (
      this.ringSource === null ||
      this.ringTexture === null ||
      this.ringSource.resourceWidth !== binCount
    ) {
      this.ringTexture?.destroy(true);
      this.ringPixels = new Uint8Array(binCount * 4);
      this.ringSource = new BufferImageSource({
        resource: this.ringPixels,
        width: binCount,
        height: 1,
        alphaMode: 'premultiply-alpha-on-upload',
        antialias: false,
        autoGenerateMipmaps: false,
        autoGarbageCollect: false,
        scaleMode: 'linear',
        addressMode: 'repeat',
        label: 'field-visualiser-ring',
      });
      this.ringTexture = new Texture({
        source: this.ringSource,
        dynamic: true,
        label: 'field-visualiser-ring-texture',
      });
      if (this.ringMesh !== null) {
        this.ringMesh.texture = this.ringTexture;
      }
    }
  }

  private updateRingMesh(
    centerX: number,
    centerY: number,
    radius: number,
    ringWidth: number,
  ): void {
    const geometryKey = `${centerX.toFixed(1)}:${centerY.toFixed(1)}:${radius.toFixed(1)}:${ringWidth.toFixed(1)}`;

    // The mesh is created exactly once; geometry changes rewrite the position
    // buffer in place. (Destroying and recreating a mesh between frames leaves
    // stale GPU bind groups behind in Pixi and crashes the next render.)
    if (this.ringMesh === null) {
      const segments = RING_GEOMETRY_SEGMENTS;
      this.ringPositions = new Float32Array((segments + 1) * 4);
      const uvs = new Float32Array((segments + 1) * 4);
      const indices = new Uint32Array(segments * 6);

      for (let segment = 0; segment <= segments; segment += 1) {
        uvs[segment * 4] = segment / segments;
        uvs[segment * 4 + 1] = 0;
        uvs[segment * 4 + 2] = segment / segments;
        uvs[segment * 4 + 3] = 1;
      }

      for (let segment = 0; segment < segments; segment += 1) {
        const base = segment * 2;
        indices[segment * 6] = base;
        indices[segment * 6 + 1] = base + 1;
        indices[segment * 6 + 2] = base + 2;
        indices[segment * 6 + 3] = base + 1;
        indices[segment * 6 + 4] = base + 3;
        indices[segment * 6 + 5] = base + 2;
      }

      const geometry = new MeshGeometry({
        positions: this.ringPositions,
        uvs,
        indices,
      });
      // Force the batched pipeline: the non-batched mesh path does not
      // survive texture replacement (stale GPU bind groups -> crash).
      geometry.batchMode = 'batch';

      if (this.ringTexture === null) {
        return;
      }

      this.ringMesh = new Mesh({ geometry, texture: this.ringTexture });
      // Between guides and bonds in the layer order.
      this.root.addChildAt(this.ringMesh, this.root.getChildIndex(this.bonds));
    }

    if (this.ringGeometryKey !== geometryKey) {
      this.ringGeometryKey = geometryKey;
      const segments = RING_GEOMETRY_SEGMENTS;
      const positions = this.ringPositions;

      for (let segment = 0; segment <= segments; segment += 1) {
        const angle = -Math.PI / 2 + (2 * Math.PI * segment) / segments;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const outer = radius + ringWidth / 2;
        const inner = radius - ringWidth / 2;
        positions[segment * 4] = centerX + cos * outer;
        positions[segment * 4 + 1] = centerY + sin * outer;
        positions[segment * 4 + 2] = centerX + cos * inner;
        positions[segment * 4 + 3] = centerY + sin * inner;
      }

      this.ringMesh.geometry.getBuffer('aPosition').update();
    }

    if (
      this.ringTexture !== null &&
      this.ringMesh.texture !== this.ringTexture
    ) {
      this.ringMesh.texture = this.ringTexture;
    }

    this.ringMesh.visible = true;
    this.ringSource?.update();
  }

  private setRingMeshVisible(visible: boolean): void {
    if (this.ringMesh !== null) {
      this.ringMesh.visible = visible;
    }
  }

  private ensureStripTexture(binCount: number): void {
    if (
      this.stripSource === null ||
      this.stripTexture === null ||
      this.stripSource.resourceWidth !== binCount
    ) {
      this.stripTexture?.destroy(true);
      this.stripPixels = new Uint8Array(binCount * 4);
      this.stripSource = new BufferImageSource({
        resource: this.stripPixels,
        width: binCount,
        height: 1,
        alphaMode: 'premultiply-alpha-on-upload',
        antialias: false,
        autoGenerateMipmaps: false,
        autoGarbageCollect: false,
        scaleMode: 'linear',
        label: 'field-visualiser-phase-strip',
      });
      this.stripTexture = new Texture({
        source: this.stripSource,
        dynamic: true,
        label: 'field-visualiser-phase-strip-texture',
      });
    }

    if (this.stripSprite === null) {
      this.stripSprite = new Sprite();
      this.root.addChildAt(
        this.stripSprite,
        this.root.getChildIndex(this.waveform),
      );
    }
  }

  private setStripVisible(visible: boolean): void {
    if (this.stripSprite !== null) {
      this.stripSprite.visible = visible;
    }
  }

  private destroyRingResources(): void {
    this.ringTexture?.destroy(true);
    this.ringTexture = null;
    this.ringSource = null;
    this.ringMesh = null;
  }

  private destroyStripResources(): void {
    this.stripTexture?.destroy(true);
    this.stripTexture = null;
    this.stripSource = null;
    this.stripSprite = null;
  }

  private updateAdaptiveQuality(frameTimeMs: number): void {
    this.smoothedRenderTimeMs =
      this.smoothedRenderTimeMs === 0
        ? frameTimeMs
        : this.smoothedRenderTimeMs * 0.82 + frameTimeMs * 0.18;

    if (this.smoothedRenderTimeMs > TARGET_FRAME_TIME_MS) {
      this.adaptiveQuality = Math.max(
        ADAPTIVE_QUALITY_MIN,
        this.adaptiveQuality - ADAPTIVE_QUALITY_STEP,
      );
      return;
    }

    if (this.smoothedRenderTimeMs < FRAME_TIME_LOWER_BOUND_MS) {
      this.adaptiveQuality = Math.min(
        1,
        this.adaptiveQuality + ADAPTIVE_QUALITY_STEP * 0.5,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function drawWraparoundBadge(guides: Graphics, x: number, y: number): void {
  // Small ring icon marking that the left and right plot edges are the same
  // physical point (periodic topology).
  guides.circle(x, y, 7).stroke({ width: 1.4, color: 0x9f1f27, alpha: 0.8 });
  guides
    .moveTo(x - 10, y)
    .lineTo(x - 7, y)
    .stroke({ width: 1.4, color: 0x9f1f27, alpha: 0.8 });
  guides
    .moveTo(x + 7, y)
    .lineTo(x + 10, y)
    .stroke({ width: 1.4, color: 0x9f1f27, alpha: 0.8 });
}

function getSiteCountKey(snapshot: RendererSnapshot): number {
  if (
    snapshot.kind === 'classical-2d' ||
    snapshot.kind === 'quantum-2d-display'
  ) {
    return snapshot.width * snapshot.height;
  }
  return snapshot.siteCount;
}

function getDisplayedValues(
  snapshot: RendererSnapshot,
  quantity: RendererQuantity,
): Float64Array | Float32Array {
  if (snapshot.kind === 'classical-2d') {
    switch (quantity) {
      case 'displacement':
        return snapshot.displacement;
      case 'velocity':
        return snapshot.velocity;
      case 'energy-density':
        return snapshot.localEnergyDensity;
      default:
        return snapshot.displacement;
    }
  }

  if (snapshot.kind === 'quantum-2d-display') {
    return snapshot.displayValues;
  }

  if (
    snapshot.kind === 'classical-1d-periodic' ||
    snapshot.kind === 'classical-1d-fixed'
  ) {
    switch (quantity) {
      case 'displacement':
        return snapshot.displacement;
      case 'velocity':
        return snapshot.velocity;
      case 'energy-density':
        return snapshot.localEnergyDensity;
      default:
        return snapshot.displacement;
    }
  }

  switch (quantity) {
    case 'probability-density':
      return snapshot.probabilityDensity;
    case 'magnitude':
      return snapshot.magnitude;
    // 'real-imaginary-parts' is rendered by a dedicated two-channel path and
    // never reaches this accessor; the real part is a safe fallback.
    case 'real-part':
    // eslint-disable-next-line no-fallthrough
    case 'real-imaginary-parts':
      return snapshot.amplitudeReal;
    case 'imaginary-part':
      return snapshot.amplitudeImaginary;
    default:
      return snapshot.probabilityDensity;
  }
}

function usesSequentialMap(quantity: RendererQuantity): boolean {
  return (
    quantity === 'energy-density' ||
    quantity === 'probability-density' ||
    quantity === 'magnitude'
  );
}

function getMaxMagnitude(values: ArrayLike<number>): number {
  let maxMagnitude = 0;

  for (let index = 0; index < values.length; index += 1) {
    maxMagnitude = Math.max(maxMagnitude, Math.abs(values[index]));
  }

  return maxMagnitude;
}

function get1DSiteRadius(siteCount: number): number {
  if (siteCount >= 128) {
    return 2.5;
  }
  if (siteCount >= 64) {
    return 3.1;
  }

  return 3.6;
}

function get1DBondWidth(siteCount: number): number {
  if (siteCount >= 128) {
    return 0.42;
  }
  if (siteCount >= 64) {
    return 0.56;
  }

  return 0.72;
}

function selectHeatmapGrid(
  cols: number,
  rows: number,
  innerWidth: number,
  innerHeight: number,
  adaptiveQuality: number,
): { width: number; height: number } {
  const cappedWidth = Math.min(
    cols,
    Math.max(MIN_HEATMAP_AXIS, Math.round(innerWidth * adaptiveQuality)),
  );
  const cappedHeight = Math.min(
    rows,
    Math.max(MIN_HEATMAP_AXIS, Math.round(innerHeight * adaptiveQuality)),
  );
  let width = cappedWidth;
  let height = cappedHeight;
  const maxPixels = Math.max(
    MIN_HEATMAP_AXIS * MIN_HEATMAP_AXIS,
    Math.round(MAX_HEATMAP_PIXELS * adaptiveQuality * adaptiveQuality),
  );

  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    width = Math.max(
      MIN_HEATMAP_AXIS,
      Math.min(cols, Math.floor(width * scale)),
    );
    height = Math.max(
      MIN_HEATMAP_AXIS,
      Math.min(rows, Math.floor(height * scale)),
    );
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function populateHeatmapPixels({
  values,
  phases,
  cols,
  rows,
  targetCols,
  targetRows,
  scaleMax,
  mode,
  heatmapPixels,
  downsampleAccum,
  downsampleAuxAccum,
  downsampleCounts,
}: {
  values: ArrayLike<number>;
  phases: ArrayLike<number> | null;
  cols: number;
  rows: number;
  targetCols: number;
  targetRows: number;
  scaleMax: number;
  mode: 'sequential' | 'diverging' | 'phase';
  heatmapPixels: Uint8Array;
  downsampleAccum: Float64Array;
  downsampleAuxAccum: Float64Array;
  downsampleCounts: Uint32Array;
}): void {
  const colorFor = (value: number, phase: number): number => {
    if (mode === 'phase') {
      return mapPhaseMagnitudeToNumber(phase, value, scaleMax);
    }
    if (mode === 'diverging') {
      return mapSignedValueToDivergingNumber(value, scaleMax);
    }
    return mapDensityToSequentialNumber(value, scaleMax);
  };

  if (targetCols === cols && targetRows === rows) {
    for (let index = 0; index < values.length; index += 1) {
      writeColorToPixelBuffer(
        heatmapPixels,
        index * 4,
        colorFor(values[index], phases !== null ? phases[index] : 0),
      );
    }
    return;
  }

  downsampleAccum.fill(0);
  downsampleCounts.fill(0);
  if (phases !== null) {
    downsampleAuxAccum.fill(0);
  }

  for (let y = 0; y < rows; y += 1) {
    const targetY = Math.min(
      targetRows - 1,
      Math.floor((y * targetRows) / rows),
    );
    for (let x = 0; x < cols; x += 1) {
      const targetX = Math.min(
        targetCols - 1,
        Math.floor((x * targetCols) / cols),
      );
      const targetIndex = targetY * targetCols + targetX;
      const sourceIndex = y * cols + x;
      downsampleAccum[targetIndex] += values[sourceIndex];
      if (phases !== null) {
        downsampleAuxAccum[targetIndex] += phases[sourceIndex];
      }
      downsampleCounts[targetIndex] += 1;
    }
  }

  for (let index = 0; index < targetCols * targetRows; index += 1) {
    const count = downsampleCounts[index];
    const averagedValue = count === 0 ? 0 : downsampleAccum[index] / count;
    const averagedPhase =
      phases !== null && count > 0 ? downsampleAuxAccum[index] / count : 0;
    writeColorToPixelBuffer(
      heatmapPixels,
      index * 4,
      colorFor(averagedValue, averagedPhase),
    );
  }
}

function writeColorToPixelBuffer(
  buffer: Uint8Array,
  offset: number,
  color: number,
): void {
  buffer[offset] = (color >> 16) & 0xff;
  buffer[offset + 1] = (color >> 8) & 0xff;
  buffer[offset + 2] = color & 0xff;
  buffer[offset + 3] = 255;
}
