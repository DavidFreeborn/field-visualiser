import type { AppMode } from '../../components/panels/ModeSwitch';
import type { Geometry } from '../../components/panels/GeometrySwitch';
import { defaultClassical1DFixedConfig } from '../presets/classical1dFixed';
import { defaultClassical1DPeriodicConfig } from '../presets/classical1dPeriodic';
import { defaultClassical2DSquareConfig } from '../presets/classical2dSquare';
import { defaultClassical2DTorusConfig } from '../presets/classical2dTorus';
import { defaultQuantum1DFixedConfig } from '../presets/quantum1dFixed';
import { defaultQuantum1DPeriodicConfig } from '../presets/quantum1dPeriodic';
import { defaultQuantum2DSquareConfig } from '../presets/quantum2dSquare';
import { defaultQuantum2DTorusConfig } from '../presets/quantum2dTorus';
import type { Classical1DFixedConfig, Classical1DFixedQuantity } from '../../physics/classical/classical1dFixed';
import type {
  Classical1DPeriodicConfig,
  Classical1DPeriodicQuantity,
} from '../../physics/classical/classical1dPeriodic';
import type { Classical2DConfig, Classical2DQuantity } from '../../physics/classical/classical2d';
import type { Classical1DInitialPreset } from '../../physics/classical/initialConditions';
import type { Quantum1DFixedConfig, Quantum1DFixedQuantity } from '../../physics/quantum/quantum1dFixed';
import type {
  Quantum1DPeriodicConfig,
  Quantum1DPeriodicQuantity,
} from '../../physics/quantum/quantum1dPeriodic';
import type { Quantum2DFixedConfig, Quantum2DFixedQuantity } from '../../physics/quantum/quantum2dFixed';
import type {
  Quantum2DPeriodicConfig,
  Quantum2DPeriodicQuantity,
} from '../../physics/quantum/quantum2dPeriodic';
import type { Quantum1DInitialPreset } from '../../physics/quantum/initialStates';
import type { Quantum2DInitialPreset } from '../../physics/quantum/initialStates2d';

type SceneQuantity =
  | Classical1DPeriodicQuantity
  | Classical1DFixedQuantity
  | Classical2DQuantity
  | Quantum1DPeriodicQuantity
  | Quantum1DFixedQuantity
  | Quantum2DFixedQuantity
  | Quantum2DPeriodicQuantity;

type SceneConfig =
  | Classical1DPeriodicConfig
  | Classical1DFixedConfig
  | Classical2DConfig
  | Quantum1DPeriodicConfig
  | Quantum1DFixedConfig
  | Quantum2DFixedConfig
  | Quantum2DPeriodicConfig;

export interface SceneStateV1 {
  readonly v: 1;
  readonly mode: AppMode;
  readonly geometry: Geometry;
  readonly quantity: SceneQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly config: SceneConfig;
}

const VALID_MODES: readonly AppMode[] = ['classical', 'quantum-one-particle'];
const VALID_GEOMETRIES: readonly Geometry[] = [
  'periodic-circle',
  'fixed-interval',
  'square-fixed',
  'torus-periodic',
];
const CLASSICAL_1D_PRESETS: readonly Classical1DInitialPreset[] = [
  'gaussian-displacement',
  'gaussian-velocity',
  'single-site-displacement',
  'standing-mode-1',
  'standing-mode-2',
];
const CLASSICAL_1D_QUANTITIES: readonly Classical1DPeriodicQuantity[] = [
  'displacement',
  'velocity',
  'energy-density',
];
const CLASSICAL_2D_PRESETS: readonly Classical2DConfig['initialPreset'][] = [
  'central-gaussian-displacement',
  'central-gaussian-velocity',
  'square-standing-mode-1-1',
  'wraparound-pulse',
  'compact-pulse',
];
const CLASSICAL_2D_QUANTITIES: readonly Classical2DQuantity[] = [
  'displacement',
  'velocity',
  'energy-density',
];
const QUANTUM_1D_PRESETS: readonly Quantum1DInitialPreset[] = [
  'site-localized',
  'gaussian-wavepacket',
  'selected-normal-mode',
  'counterpropagating-superposition',
];
const QUANTUM_1D_QUANTITIES: readonly Quantum1DPeriodicQuantity[] = [
  'probability-density',
  'magnitude',
  'real-part',
  'imaginary-part',
];
const QUANTUM_2D_PRESETS: readonly Quantum2DInitialPreset[] = [
  'site-localized',
  'gaussian-wavepacket',
  'selected-normal-mode',
  'split-superposition',
];
const QUANTUM_2D_QUANTITIES: readonly Quantum2DPeriodicQuantity[] = [
  'probability-density',
  'magnitude',
  'real-part',
  'imaginary-part',
];

export function parseSceneState(search: string): SceneStateV1 | null {
  const params = new URLSearchParams(search);
  const rawScene = params.get('scene');

  if (rawScene === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawScene);

    if (!isRecord(parsed) || parsed.v !== 1) {
      return null;
    }

    const mode = coerceEnum(parsed.mode, VALID_MODES, 'classical');
    const geometry = coerceEnum(parsed.geometry, VALID_GEOMETRIES, 'periodic-circle');
    const playing = coerceBoolean(parsed.playing, true);
    const speed = coerceNumber(parsed.speed, 1, { min: 0.1, max: 4 });
    const showLattice = coerceBoolean(parsed.showLattice, getDefaultShowLattice(mode, geometry));
    const showSprings = coerceBoolean(parsed.showSprings, getDefaultShowSprings(mode, geometry));
    const configRecord = isRecord(parsed.config) ? parsed.config : {};

    switch (`${mode}:${geometry}`) {
      case 'classical:periodic-circle':
        return {
          v: 1,
          mode,
          geometry,
          quantity: coerceEnum(
            parsed.quantity,
            CLASSICAL_1D_QUANTITIES,
            'displacement',
          ),
          playing,
          speed,
          showLattice,
          showSprings,
          config: sanitizeClassical1DPeriodicConfig(configRecord),
        };
      case 'classical:fixed-interval':
        return {
          v: 1,
          mode,
          geometry,
          quantity: coerceEnum(
            parsed.quantity,
            CLASSICAL_1D_QUANTITIES,
            'displacement',
          ),
          playing,
          speed,
          showLattice,
          showSprings,
          config: sanitizeClassical1DFixedConfig(configRecord),
        };
      case 'classical:square-fixed':
        return {
          v: 1,
          mode,
          geometry,
          quantity: coerceEnum(
            parsed.quantity,
            CLASSICAL_2D_QUANTITIES,
            'displacement',
          ),
          playing,
          speed,
          showLattice,
          showSprings: false,
          config: sanitizeClassical2DConfig(configRecord, defaultClassical2DSquareConfig),
        };
      case 'classical:torus-periodic':
        return {
          v: 1,
          mode,
          geometry,
          quantity: coerceEnum(
            parsed.quantity,
            CLASSICAL_2D_QUANTITIES,
            'displacement',
          ),
          playing,
          speed,
          showLattice,
          showSprings: false,
          config: sanitizeClassical2DConfig(configRecord, defaultClassical2DTorusConfig),
        };
      case 'quantum-one-particle:periodic-circle':
        return {
          v: 1,
          mode,
          geometry,
          quantity: coerceEnum(
            parsed.quantity,
            QUANTUM_1D_QUANTITIES,
            'probability-density',
          ),
          playing,
          speed,
          showLattice,
          showSprings: false,
          config: sanitizeQuantum1DPeriodicConfig(configRecord),
        };
      case 'quantum-one-particle:fixed-interval':
        return {
          v: 1,
          mode,
          geometry,
          quantity: coerceEnum(
            parsed.quantity,
            QUANTUM_1D_QUANTITIES,
            'probability-density',
          ),
          playing,
          speed,
          showLattice,
          showSprings: false,
          config: sanitizeQuantum1DFixedConfig(configRecord),
        };
      case 'quantum-one-particle:square-fixed':
        return {
          v: 1,
          mode,
          geometry,
          quantity: coerceEnum(
            parsed.quantity,
            QUANTUM_2D_QUANTITIES,
            'probability-density',
          ),
          playing,
          speed,
          showLattice,
          showSprings: false,
          config: sanitizeQuantum2DConfig(configRecord, defaultQuantum2DSquareConfig),
        };
      case 'quantum-one-particle:torus-periodic':
        return {
          v: 1,
          mode,
          geometry,
          quantity: coerceEnum(
            parsed.quantity,
            QUANTUM_2D_QUANTITIES,
            'probability-density',
          ),
          playing,
          speed,
          showLattice,
          showSprings: false,
          config: sanitizeQuantum2DConfig(configRecord, defaultQuantum2DTorusConfig),
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function buildSceneSearch(
  scene: SceneStateV1,
  currentSearch: string,
  options: { preserveEmbed: boolean },
): string {
  const params = new URLSearchParams();
  const currentParams = new URLSearchParams(currentSearch);

  if (options.preserveEmbed && currentParams.get('embed') === '1') {
    params.set('embed', '1');
  }

  params.set('scene', JSON.stringify(scene));

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

export function buildShareUrl(
  scene: SceneStateV1,
  location: Pick<Location, 'origin' | 'pathname' | 'search'>,
  options: { includeEmbed: boolean },
): string {
  return `${location.origin}${location.pathname}${buildSceneSearch(scene, location.search, {
    preserveEmbed: options.includeEmbed,
  })}`;
}

function sanitizeClassical1DPeriodicConfig(config: Record<string, unknown>): Classical1DPeriodicConfig {
  return {
    siteCount: coerceInteger(config.siteCount, defaultClassical1DPeriodicConfig.siteCount, 8, 2048),
    waveSpeed: coerceNumber(config.waveSpeed, defaultClassical1DPeriodicConfig.waveSpeed, {
      min: 0.1,
      max: 5,
    }),
    domainLength: coerceNumber(config.domainLength, defaultClassical1DPeriodicConfig.domainLength, {
      min: 0.1,
      max: 10,
    }),
    amplitude: coerceNumber(config.amplitude, defaultClassical1DPeriodicConfig.amplitude, {
      min: 0.01,
      max: 2,
    }),
    initialCenter: coerceNumber(config.initialCenter, defaultClassical1DPeriodicConfig.initialCenter, {
      min: 0,
      max: 1,
    }),
    gaussianWidth: coerceNumber(config.gaussianWidth, defaultClassical1DPeriodicConfig.gaussianWidth, {
      min: 0.005,
      max: 1,
    }),
    initialPreset: coerceEnum(
      config.initialPreset,
      CLASSICAL_1D_PRESETS,
      defaultClassical1DPeriodicConfig.initialPreset,
    ),
  };
}

function sanitizeClassical1DFixedConfig(config: Record<string, unknown>): Classical1DFixedConfig {
  return {
    siteCount: coerceInteger(config.siteCount, defaultClassical1DFixedConfig.siteCount, 4, 2049),
    waveSpeed: coerceNumber(config.waveSpeed, defaultClassical1DFixedConfig.waveSpeed, {
      min: 0.1,
      max: 5,
    }),
    domainLength: coerceNumber(config.domainLength, defaultClassical1DFixedConfig.domainLength, {
      min: 0.1,
      max: 10,
    }),
    amplitude: coerceNumber(config.amplitude, defaultClassical1DFixedConfig.amplitude, {
      min: 0.01,
      max: 2,
    }),
    initialCenter: coerceNumber(config.initialCenter, defaultClassical1DFixedConfig.initialCenter, {
      min: 0,
      max: 1,
    }),
    gaussianWidth: coerceNumber(config.gaussianWidth, defaultClassical1DFixedConfig.gaussianWidth, {
      min: 0.005,
      max: 1,
    }),
    initialPreset: coerceEnum(
      config.initialPreset,
      CLASSICAL_1D_PRESETS,
      defaultClassical1DFixedConfig.initialPreset,
    ),
  };
}

function sanitizeClassical2DConfig(
  config: Record<string, unknown>,
  defaults: Classical2DConfig,
): Classical2DConfig {
  return {
    geometry: defaults.geometry,
    size: coerceInteger(config.size, defaults.size, 8, 512),
    waveSpeed: coerceNumber(config.waveSpeed, defaults.waveSpeed, { min: 0.1, max: 5 }),
    domainLength: coerceNumber(config.domainLength, defaults.domainLength, { min: 0.1, max: 10 }),
    amplitude: coerceNumber(config.amplitude, defaults.amplitude, { min: 0.01, max: 2 }),
    gaussianWidth: coerceNumber(config.gaussianWidth, defaults.gaussianWidth, { min: 0.01, max: 1 }),
    initialPreset: coerceEnum(config.initialPreset, CLASSICAL_2D_PRESETS, defaults.initialPreset),
  };
}

function sanitizeQuantum1DPeriodicConfig(config: Record<string, unknown>): Quantum1DPeriodicConfig {
  return {
    siteCount: coerceInteger(config.siteCount, defaultQuantum1DPeriodicConfig.siteCount, 8, 2048),
    waveSpeed: coerceNumber(config.waveSpeed, defaultQuantum1DPeriodicConfig.waveSpeed, {
      min: 0.1,
      max: 5,
    }),
    domainLength: coerceNumber(config.domainLength, defaultQuantum1DPeriodicConfig.domainLength, {
      min: 0.1,
      max: 10,
    }),
    initialCenter: coerceNumber(config.initialCenter, defaultQuantum1DPeriodicConfig.initialCenter, {
      min: 0,
      max: 1,
    }),
    gaussianWidth: coerceNumber(config.gaussianWidth, defaultQuantum1DPeriodicConfig.gaussianWidth, {
      min: 0.005,
      max: 1,
    }),
    momentumWidth: coerceNumber(config.momentumWidth, defaultQuantum1DPeriodicConfig.momentumWidth, {
      min: 0.1,
      max: 10,
    }),
    modeNumber: coerceInteger(config.modeNumber, defaultQuantum1DPeriodicConfig.modeNumber, 0, 2048),
    initialPreset: coerceEnum(
      config.initialPreset,
      QUANTUM_1D_PRESETS,
      defaultQuantum1DPeriodicConfig.initialPreset,
    ),
  };
}

function sanitizeQuantum1DFixedConfig(config: Record<string, unknown>): Quantum1DFixedConfig {
  return {
    siteCount: coerceInteger(config.siteCount, defaultQuantum1DFixedConfig.siteCount, 4, 2049),
    waveSpeed: coerceNumber(config.waveSpeed, defaultQuantum1DFixedConfig.waveSpeed, {
      min: 0.1,
      max: 5,
    }),
    domainLength: coerceNumber(config.domainLength, defaultQuantum1DFixedConfig.domainLength, {
      min: 0.1,
      max: 10,
    }),
    initialCenter: coerceNumber(config.initialCenter, defaultQuantum1DFixedConfig.initialCenter, {
      min: 0,
      max: 1,
    }),
    gaussianWidth: coerceNumber(config.gaussianWidth, defaultQuantum1DFixedConfig.gaussianWidth, {
      min: 0.005,
      max: 1,
    }),
    momentumWidth: coerceNumber(config.momentumWidth, defaultQuantum1DFixedConfig.momentumWidth, {
      min: 0.1,
      max: 10,
    }),
    modeNumber: coerceInteger(config.modeNumber, defaultQuantum1DFixedConfig.modeNumber, 1, 2048),
    initialPreset: coerceEnum(
      config.initialPreset,
      QUANTUM_1D_PRESETS,
      defaultQuantum1DFixedConfig.initialPreset,
    ),
  };
}

function sanitizeQuantum2DConfig(
  config: Record<string, unknown>,
  defaults: Quantum2DPeriodicConfig | Quantum2DFixedConfig,
): Quantum2DPeriodicConfig | Quantum2DFixedConfig {
  return {
    size: coerceInteger(config.size, defaults.size, 8, 256),
    waveSpeed: coerceNumber(config.waveSpeed, defaults.waveSpeed, { min: 0.1, max: 5 }),
    domainLength: coerceNumber(config.domainLength, defaults.domainLength, { min: 0.1, max: 10 }),
    initialCenterX: coerceNumber(config.initialCenterX, defaults.initialCenterX, { min: 0, max: 1 }),
    initialCenterY: coerceNumber(config.initialCenterY, defaults.initialCenterY, { min: 0, max: 1 }),
    gaussianWidth: coerceNumber(config.gaussianWidth, defaults.gaussianWidth, { min: 0.01, max: 1 }),
    momentumWidth: coerceNumber(config.momentumWidth, defaults.momentumWidth, { min: 0.1, max: 10 }),
    modeNumberX: coerceInteger(config.modeNumberX, defaults.modeNumberX, 0, 256),
    modeNumberY: coerceInteger(config.modeNumberY, defaults.modeNumberY, 0, 256),
    initialPreset: coerceEnum(config.initialPreset, QUANTUM_2D_PRESETS, defaults.initialPreset),
  };
}

function getDefaultShowLattice(mode: AppMode, geometry: Geometry): boolean {
  if (mode === 'classical') {
    return geometry === 'periodic-circle' || geometry === 'fixed-interval';
  }

  return geometry === 'periodic-circle' || geometry === 'fixed-interval';
}

function getDefaultShowSprings(mode: AppMode, geometry: Geometry): boolean {
  return mode === 'classical' && (geometry === 'periodic-circle' || geometry === 'fixed-interval');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return fallback;
  }

  return value;
}

function coerceNumber(
  value: unknown,
  fallback: number,
  options: { min: number; max: number },
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < options.min ||
    value > options.max
  ) {
    return fallback;
  }

  return value;
}

function coerceEnum<T extends string>(
  value: unknown,
  validValues: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && validValues.includes(value as T) ? (value as T) : fallback;
}
