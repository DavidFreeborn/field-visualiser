import { Application, Container, Graphics } from 'pixi.js';
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
import { hexToNumber, mapDensityToSequentialColor, mapSignedValueToDivergingColor } from '../colorMaps';

export interface PeriodicClassicalFieldRendererOptions {
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly quantity:
    | Classical1DPeriodicQuantity
    | Classical1DFixedQuantity
    | Classical2DQuantity
    | Quantum1DPeriodicQuantity
    | Quantum1DFixedQuantity;
}

type Periodic1DSnapshot =
  | Classical1DPeriodicSnapshot
  | Classical1DFixedSnapshot
  | Classical2DSnapshot
  | Quantum1DPeriodicSnapshot
  | Quantum1DFixedSnapshot;

const PADDING_X = 28;
const PADDING_Y = 30;

export class PeriodicClassicalFieldRenderer {
  private readonly host: HTMLElement;

  private readonly app = new Application();

  private readonly root = new Container();

  private readonly background = new Graphics();

  private readonly guides = new Graphics();

  private readonly bonds = new Graphics();

  private readonly waveform = new Graphics();

  private readonly masses = new Graphics();

  private initialised = false;

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
    this.root.addChild(this.background, this.guides, this.bonds, this.waveform, this.masses);
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
    if (snapshot.kind === 'classical-2d') {
      this.render2D(snapshot, width, height, options);
      this.app.render();
      return;
    }

    const baseline = height / 2;
    const innerWidth = Math.max(1, width - 2 * PADDING_X);
    const innerHeight = Math.max(1, height - 2 * PADDING_Y);
    const values = getDisplayedValues(snapshot, options.quantity);
    const maxMagnitude = getMaxMagnitude(values) || 1;
    const useSequentialMap = usesSequentialMap(options.quantity);

    this.background.clear();
    this.background
      .roundRect(0, 0, width, height, 24)
      .fill({ color: 0xfcfaf7, alpha: 0.92 })
      .stroke({ width: 1, color: 0xd8d1c8, alpha: 1 });

    this.guides.clear();
    this.guides
      .moveTo(PADDING_X, baseline)
      .lineTo(width - PADDING_X, baseline)
      .stroke({ width: 1, color: 0x9ea6b0, alpha: 0.55 });

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
          ? hexToNumber(mapDensityToSequentialColor(values[index], maxMagnitude))
          : hexToNumber(mapSignedValueToDivergingColor(values[index], maxMagnitude));

        if (options.showLattice) {
          this.masses.circle(x, y, 3.2).fill({ color, alpha: 0.95 });
        }

        if (
          options.showSprings &&
          (snapshot.kind === 'classical-1d-periodic' || snapshot.kind === 'classical-1d-fixed') &&
          index < values.length - 1
        ) {
          const nextX = PADDING_X + (innerWidth * (index + 1)) / Math.max(1, values.length - 1);
          const nextY =
            baseline - (values[index + 1] / maxMagnitude) * innerHeight * 0.42;
          const bondColor =
            useSequentialMap
              ? 0x8f2d28
              : hexToNumber(
                  mapSignedValueToDivergingColor(values[index + 1] - values[index], maxMagnitude),
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

    this.app.destroy(undefined, { children: true });
    this.initialised = false;
  }

  private render2D(
    snapshot: Classical2DSnapshot,
    width: number,
    height: number,
    options: PeriodicClassicalFieldRendererOptions,
  ): void {
    const values = getDisplayedValues(snapshot, options.quantity);
    const maxMagnitude = getMaxMagnitude(values) || 1;
    const useSequentialMap = usesSequentialMap(options.quantity);
    const cols = snapshot.width;
    const rows = snapshot.height;
    const innerWidth = Math.max(1, width - 2 * PADDING_X);
    const innerHeight = Math.max(1, height - 2 * PADDING_Y);
    const cellWidth = innerWidth / cols;
    const cellHeight = innerHeight / rows;

    this.background.clear();
    this.background
      .roundRect(0, 0, width, height, 24)
      .fill({ color: 0xfcfaf7, alpha: 0.92 })
      .stroke({ width: 1, color: 0xd8d1c8, alpha: 1 });

    this.guides.clear();
    this.waveform.clear();
    this.bonds.clear();
    this.masses.clear();

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const index = y * cols + x;
        const color = useSequentialMap
          ? hexToNumber(mapDensityToSequentialColor(values[index], maxMagnitude))
          : hexToNumber(mapSignedValueToDivergingColor(values[index], maxMagnitude));
        this.waveform
          .rect(PADDING_X + x * cellWidth, PADDING_Y + y * cellHeight, cellWidth + 0.5, cellHeight + 0.5)
          .fill({ color, alpha: 0.98 });

        if (options.showLattice) {
          this.masses
            .circle(PADDING_X + (x + 0.5) * cellWidth, PADDING_Y + (y + 0.5) * cellHeight, 1.1)
            .fill({ color: 0x17202a, alpha: 0.2 });
        }
      }
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
    | Quantum1DFixedQuantity,
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
    | Quantum1DFixedQuantity,
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
