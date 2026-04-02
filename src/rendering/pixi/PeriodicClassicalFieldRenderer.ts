import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
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
import type {
  Quantum2DPeriodicQuantity,
  Quantum2DPeriodicSnapshot,
} from '../../physics/quantum/quantum2dPeriodic';
import type {
  Quantum2DFixedQuantity,
  Quantum2DFixedSnapshot,
} from '../../physics/quantum/quantum2dFixed';
import {
  mapDensityToSequentialNumber,
  mapSignedValueToDivergingNumber,
} from '../colorMaps';

export interface PeriodicClassicalFieldRendererOptions {
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly quantity:
    | Classical1DPeriodicQuantity
    | Classical1DFixedQuantity
    | Classical2DQuantity
    | Quantum1DPeriodicQuantity
    | Quantum1DFixedQuantity
    | Quantum2DPeriodicQuantity
    | Quantum2DFixedQuantity;
}

type Periodic1DSnapshot =
  | Classical1DPeriodicSnapshot
  | Classical1DFixedSnapshot
  | Classical2DSnapshot
  | Quantum1DPeriodicSnapshot
  | Quantum1DFixedSnapshot
  | Quantum2DPeriodicSnapshot
  | Quantum2DFixedSnapshot;

const PADDING_X = 28;
const PADDING_Y = 30;
const MAX_HEATMAP_PIXELS = 180_000;
const MIN_HEATMAP_AXIS = 24;
const MAX_LATTICE_MARKERS_2D = 4_096;
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

  private readonly bonds = new Graphics();

  private readonly waveform = new Graphics();

  private readonly masses = new Graphics();

  private initialised = false;

  private lastChromeKey = '';

  private heatmapTexture: Texture<BufferImageSource> | null = null;

  private heatmapSource: BufferImageSource | null = null;

  private heatmapPixels = new Uint8Array(0);

  private downsampleAccum = new Float64Array(0);

  private downsampleCounts = new Uint32Array(0);

  private adaptiveQuality = 1;

  private smoothedRenderTimeMs = 0;

  public constructor(host: HTMLElement) {
    this.host = host;
  }

  public async init(): Promise<void> {
    await this.app.init({
      antialias: true,
      backgroundAlpha: 0,
      resizeTo: this.host,
      resolution: window.devicePixelRatio || 1,
    });

    this.host.appendChild(this.app.canvas);
    this.heatmap.visible = false;
    this.root.addChild(
      this.background,
      this.heatmap,
      this.guides,
      this.bonds,
      this.waveform,
      this.masses,
    );
    this.app.stage.addChild(this.root);
    this.initialised = true;
  }

  public render(
    snapshot: Periodic1DSnapshot,
    options: PeriodicClassicalFieldRendererOptions,
  ): void {
    if (!this.initialised) {
      return;
    }

    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (
      snapshot.kind === 'classical-2d' ||
      snapshot.kind === 'quantum-2d-periodic' ||
      snapshot.kind === 'quantum-2d-fixed'
    ) {
      this.render2D(snapshot, width, height, options);
      this.app.render();
      return;
    }

    this.heatmap.visible = false;
    const values = getDisplayedValues(snapshot, options.quantity);
    const maxMagnitude = getMaxMagnitude(values) || 1;
    const useSequentialMap = usesSequentialMap(options.quantity);

    if (snapshot.boundaryCondition === 'periodic') {
      this.renderCircular1D(width, height, values, maxMagnitude, useSequentialMap, options);
      this.app.render();
      return;
    }

    const baseline = height / 2;
    const innerWidth = Math.max(1, width - 2 * PADDING_X);
    const innerHeight = Math.max(1, height - 2 * PADDING_Y);

    this.drawChrome(width, height, baseline);

    this.waveform.clear();
    this.bonds.clear();
    this.masses.clear();

    for (let index = 0; index < values.length; index += 1) {
      const x = PADDING_X + (innerWidth * index) / Math.max(1, values.length - 1);
      const y = baseline - (values[index] / maxMagnitude) * innerHeight * 0.42;

      if (index === 0) {
        this.waveform.moveTo(x, y);
      } else {
        this.waveform.lineTo(x, y);
      }

      if (options.showLattice || options.showSprings) {
        const color = useSequentialMap
          ? mapDensityToSequentialNumber(values[index], maxMagnitude)
          : mapSignedValueToDivergingNumber(values[index], maxMagnitude);

        if (options.showLattice) {
          this.masses.circle(x, y, 3.2).fill({ color, alpha: 0.95 });
        }

        if (
          options.showSprings &&
          snapshot.kind === 'classical-1d-fixed' &&
          index < values.length - 1
        ) {
          const nextX = PADDING_X + (innerWidth * (index + 1)) / Math.max(1, values.length - 1);
          const nextY =
            baseline - (values[index + 1] / maxMagnitude) * innerHeight * 0.42;
          const bondColor =
            useSequentialMap
              ? 0x8f2d28
              : mapSignedValueToDivergingNumber(
                  values[index + 1] - values[index],
                  maxMagnitude,
                );

          this.bonds
            .moveTo(x, y)
            .lineTo(nextX, nextY)
            .stroke({ width: 1.2, color: bondColor, alpha: 0.35 });
        }
      }
    }

    this.waveform.stroke({ width: 2.5, color: 0x18222c, alpha: 0.95 });
    this.app.render();
  }

  public destroy(): void {
    if (!this.initialised) {
      return;
    }

    this.destroyHeatmapResources();
    this.app.destroy(undefined, { children: true });
    this.initialised = false;
  }

  private render2D(
    snapshot: Classical2DSnapshot | Quantum2DPeriodicSnapshot | Quantum2DFixedSnapshot,
    width: number,
    height: number,
    options: PeriodicClassicalFieldRendererOptions,
  ): void {
    const renderStart = performance.now();
    const values = getDisplayedValues(snapshot, options.quantity);
    const maxMagnitude = getMaxMagnitude(values) || 1;
    const useSequentialMap = usesSequentialMap(options.quantity);
    const cols = snapshot.width;
    const rows = snapshot.height;
    const innerWidth = Math.max(1, width - 2 * PADDING_X);
    const innerHeight = Math.max(1, height - 2 * PADDING_Y);
    const displayGrid = selectHeatmapGrid(
      cols,
      rows,
      innerWidth,
      innerHeight,
      this.adaptiveQuality,
    );

    this.drawChrome(width, height);
    this.waveform.clear();
    this.bonds.clear();
    this.masses.clear();
    this.ensureHeatmapTexture(displayGrid.width, displayGrid.height);
    populateHeatmapPixels({
      values,
      cols,
      rows,
      targetCols: displayGrid.width,
      targetRows: displayGrid.height,
      maxMagnitude,
      useSequentialMap,
      heatmapPixels: this.heatmapPixels,
      downsampleAccum: this.downsampleAccum,
      downsampleCounts: this.downsampleCounts,
    });

    if (this.heatmapSource === null || this.heatmapTexture === null) {
      throw new Error('2D heatmap resources were not initialised.');
    }

    this.heatmapSource.scaleMode =
      displayGrid.width < cols || displayGrid.height < rows ? 'linear' : 'nearest';
    this.heatmapSource.update();
    this.heatmap.texture = this.heatmapTexture;
    this.heatmap.visible = true;
    this.heatmap.alpha = 0.98;
    this.heatmap.x = PADDING_X;
    this.heatmap.y = PADDING_Y;
    this.heatmap.width = innerWidth;
    this.heatmap.height = innerHeight;

    if (options.showLattice) {
      this.render2DLatticeOverlay(cols, rows, innerWidth, innerHeight);
    }

    this.updateAdaptiveQuality(performance.now() - renderStart);
  }

  private renderCircular1D(
    width: number,
    height: number,
    values: Float64Array,
    maxMagnitude: number,
    useSequentialMap: boolean,
    options: PeriodicClassicalFieldRendererOptions,
  ): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.max(32, Math.min(width, height) * 0.29);
    const radialScale = Math.min(width, height) * 0.1;

    this.drawChrome(width, height);
    this.waveform.clear();
    this.bonds.clear();
    this.masses.clear();

    this.guides
      .moveTo(centerX + baseRadius, centerY)
      .circle(centerX, centerY, baseRadius)
      .stroke({ width: 1, color: 0x9ea6b0, alpha: 0.45 });

    for (let index = 0; index < values.length; index += 1) {
      const angle = (-Math.PI / 2) + (2 * Math.PI * index) / values.length;
      const normalizedValue = values[index] / maxMagnitude;
      const radiusOffset = useSequentialMap
        ? Math.max(0, normalizedValue) * radialScale
        : normalizedValue * radialScale;
      const radius = baseRadius + radiusOffset;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      if (index === 0) {
        this.waveform.moveTo(x, y);
      } else {
        this.waveform.lineTo(x, y);
      }

      if (options.showLattice || options.showSprings) {
        const color = useSequentialMap
          ? mapDensityToSequentialNumber(values[index], maxMagnitude)
          : mapSignedValueToDivergingNumber(values[index], maxMagnitude);

        if (options.showLattice) {
          this.masses.circle(x, y, 3.2).fill({ color, alpha: 0.95 });
        }

        if (options.showSprings) {
          const nextIndex = (index + 1) % values.length;
          const nextAngle = (-Math.PI / 2) + (2 * Math.PI * nextIndex) / values.length;
          const nextNormalizedValue = values[nextIndex] / maxMagnitude;
          const nextRadiusOffset = useSequentialMap
            ? Math.max(0, nextNormalizedValue) * radialScale
            : nextNormalizedValue * radialScale;
          const nextRadius = baseRadius + nextRadiusOffset;
          const nextX = centerX + Math.cos(nextAngle) * nextRadius;
          const nextY = centerY + Math.sin(nextAngle) * nextRadius;
          const bondColor = useSequentialMap
            ? 0x8f2d28
            : mapSignedValueToDivergingNumber(values[nextIndex] - values[index], maxMagnitude);

          this.bonds
            .moveTo(x, y)
            .lineTo(nextX, nextY)
            .stroke({ width: 1.2, color: bondColor, alpha: 0.35 });
        }
      }
    }

    this.waveform.closePath().stroke({ width: 2.5, color: 0x18222c, alpha: 0.95 });
  }

  private render2DLatticeOverlay(
    cols: number,
    rows: number,
    innerWidth: number,
    innerHeight: number,
  ): void {
    const stride = Math.max(1, Math.ceil(Math.sqrt((cols * rows) / MAX_LATTICE_MARKERS_2D)));
    const cellWidth = innerWidth / cols;
    const cellHeight = innerHeight / rows;

    for (let y = 0; y < rows; y += stride) {
      for (let x = 0; x < cols; x += stride) {
        this.masses
          .circle(PADDING_X + (x + 0.5) * cellWidth, PADDING_Y + (y + 0.5) * cellHeight, 1.1)
          .fill({ color: 0x17202a, alpha: 0.2 });
      }
    }
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
      this.adaptiveQuality = Math.min(1, this.adaptiveQuality + ADAPTIVE_QUALITY_STEP * 0.5);
    }
  }

  private drawChrome(width: number, height: number, baseline?: number): void {
    const chromeKey = `${width}:${height}:${baseline ?? 'none'}`;

    if (chromeKey === this.lastChromeKey) {
      return;
    }

    this.lastChromeKey = chromeKey;
    this.background.clear();
    this.background
      .roundRect(0, 0, width, height, 24)
      .fill({ color: 0xfcfaf7, alpha: 0.92 })
      .stroke({ width: 1, color: 0xd8d1c8, alpha: 1 });

    this.guides.clear();
    if (baseline !== undefined) {
      this.guides
        .moveTo(PADDING_X, baseline)
        .lineTo(width - PADDING_X, baseline)
        .stroke({ width: 1, color: 0x9ea6b0, alpha: 0.55 });
    }
  }
}

function getDisplayedValues(
  snapshot: Periodic1DSnapshot,
  quantity:
    | Classical1DPeriodicQuantity
    | Classical1DFixedQuantity
    | Classical2DQuantity
    | Quantum1DPeriodicQuantity
    | Quantum1DFixedQuantity
    | Quantum2DPeriodicQuantity
    | Quantum2DFixedQuantity,
): Float64Array {
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

  if (snapshot.kind === 'quantum-2d-periodic' || snapshot.kind === 'quantum-2d-fixed') {
    switch (quantity) {
      case 'probability-density':
        return snapshot.probabilityDensity;
      case 'magnitude':
        return snapshot.magnitude;
      case 'real-part':
        return snapshot.amplitudeReal;
      case 'imaginary-part':
        return snapshot.amplitudeImaginary;
      default:
        return snapshot.probabilityDensity;
    }
  }

  if (snapshot.kind === 'classical-1d-periodic' || snapshot.kind === 'classical-1d-fixed') {
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
    case 'real-part':
      return snapshot.amplitudeReal;
    case 'imaginary-part':
      return snapshot.amplitudeImaginary;
    default:
      return snapshot.probabilityDensity;
  }
}

function usesSequentialMap(
  quantity:
    | Classical1DPeriodicQuantity
    | Classical1DFixedQuantity
    | Classical2DQuantity
    | Quantum1DPeriodicQuantity
    | Quantum1DFixedQuantity
    | Quantum2DPeriodicQuantity
    | Quantum2DFixedQuantity,
): boolean {
  return quantity === 'energy-density' || quantity === 'probability-density' || quantity === 'magnitude';
}

function getMaxMagnitude(values: Float64Array): number {
  let maxMagnitude = 0;

  for (let index = 0; index < values.length; index += 1) {
    maxMagnitude = Math.max(maxMagnitude, Math.abs(values[index]));
  }

  return maxMagnitude;
}

function selectHeatmapGrid(
  cols: number,
  rows: number,
  innerWidth: number,
  innerHeight: number,
  adaptiveQuality: number,
): { width: number; height: number } {
  const cappedWidth = Math.min(cols, Math.max(MIN_HEATMAP_AXIS, Math.round(innerWidth * adaptiveQuality)));
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
    width = Math.max(MIN_HEATMAP_AXIS, Math.min(cols, Math.floor(width * scale)));
    height = Math.max(MIN_HEATMAP_AXIS, Math.min(rows, Math.floor(height * scale)));
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function populateHeatmapPixels({
  values,
  cols,
  rows,
  targetCols,
  targetRows,
  maxMagnitude,
  useSequentialMap,
  heatmapPixels,
  downsampleAccum,
  downsampleCounts,
}: {
  values: Float64Array;
  cols: number;
  rows: number;
  targetCols: number;
  targetRows: number;
  maxMagnitude: number;
  useSequentialMap: boolean;
  heatmapPixels: Uint8Array;
  downsampleAccum: Float64Array;
  downsampleCounts: Uint32Array;
}): void {
  if (targetCols === cols && targetRows === rows) {
    for (let index = 0; index < values.length; index += 1) {
      writeColorToPixelBuffer(
        heatmapPixels,
        index * 4,
        useSequentialMap
          ? mapDensityToSequentialNumber(values[index], maxMagnitude)
          : mapSignedValueToDivergingNumber(values[index], maxMagnitude),
      );
    }
    return;
  }

  downsampleAccum.fill(0);
  downsampleCounts.fill(0);

  for (let y = 0; y < rows; y += 1) {
    const targetY = Math.min(targetRows - 1, Math.floor((y * targetRows) / rows));
    for (let x = 0; x < cols; x += 1) {
      const targetX = Math.min(targetCols - 1, Math.floor((x * targetCols) / cols));
      const targetIndex = targetY * targetCols + targetX;
      downsampleAccum[targetIndex] += values[y * cols + x];
      downsampleCounts[targetIndex] += 1;
    }
  }

  for (let index = 0; index < targetCols * targetRows; index += 1) {
    const averagedValue =
      downsampleCounts[index] === 0 ? 0 : downsampleAccum[index] / downsampleCounts[index];
    writeColorToPixelBuffer(
      heatmapPixels,
      index * 4,
      useSequentialMap
        ? mapDensityToSequentialNumber(averagedValue, maxMagnitude)
        : mapSignedValueToDivergingNumber(averagedValue, maxMagnitude),
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
