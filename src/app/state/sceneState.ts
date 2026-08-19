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
import type {
  Classical1DFixedConfig,
  Classical1DFixedQuantity,
} from '../../physics/classical/classical1dFixed';
import type {
  Classical1DPeriodicConfig,
  Classical1DPeriodicQuantity,
} from '../../physics/classical/classical1dPeriodic';
import {
  CLASSICAL_2D_SQUARE_PRESETS,
  CLASSICAL_2D_TORUS_PRESETS,
  type Classical2DConfig,
  type Classical2DQuantity,
} from '../../physics/classical/classical2d';
import {
  CLASSICAL_1D_FIXED_PRESETS,
  CLASSICAL_1D_PERIODIC_PRESETS,
} from '../../physics/classical/initialConditions';
import type {
  Quantum1DFixedConfig,
  Quantum1DFixedQuantity,
} from '../../physics/quantum/quantum1dFixed';
import type {
  Quantum1DPeriodicConfig,
  Quantum1DPeriodicQuantity,
} from '../../physics/quantum/quantum1dPeriodic';
import type {
  Quantum2DFixedConfig,
  Quantum2DFixedQuantity,
} from '../../physics/quantum/quantum2dFixed';
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
  readonly circleLayout?: 'radial' | 'longitudinal';
  /**
   * 1D representation: the ring topology view (default) or the unwrapped
   * position-vs-value analysis plot. Optional so pre-existing serialized
   * scenes keep loading; absent means the current default ('ring').
   */
  readonly view1d?: 'plot' | 'ring';
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly config: SceneConfig;
}

const VALID_MODES: readonly AppMode[] = ['classical', 'quantum-one-particle'];
const VALID_GEOMETRIES: readonly Geometry[] = [
  'periodic-circle',
  'periodic-circle-fixed',
  'fixed-interval',
  'square-fixed',
  'torus-periodic',
];
// The engine-level list additionally contains 'gaussian-velocity' (kept for
// zero-mode physics tests); shared scenes and the UI use the zero-mean
// correction instead, so legacy scenes are remapped rather than accepted.
const SCENE_CLASSICAL_1D_PERIODIC_PRESETS =
  CLASSICAL_1D_PERIODIC_PRESETS.filter(
    (preset) => preset !== 'gaussian-velocity',
  );
const CLASSICAL_1D_QUANTITIES: readonly Classical1DPeriodicQuantity[] = [
  'displacement',
  'velocity',
  'energy-density',
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
  'phase-magnitude',
  'real-imaginary-parts',
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
  'phase-magnitude',
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
    const geometry = coerceEnum(
      parsed.geometry,
      VALID_GEOMETRIES,
      'periodic-circle',
    );
    const playing = coerceBoolean(parsed.playing, true);
    const speed = coerceNumber(parsed.speed, 1, { min: 0.1, max: 4 });
    const showLattice = coerceBoolean(
      parsed.showLattice,
      getDefaultShowLattice(mode, geometry),
    );
    const showSprings = coerceBoolean(
      parsed.showSprings,
      getDefaultShowSprings(mode, geometry),
    );
    const configRecord = isRecord(parsed.config) ? parsed.config : {};
    // Optional display fields added after the first release; absent in older
    // serialized scenes, which then get today's defaults. The circle is the
    // default representation for periodic 1D geometries.
    const view1d = coerceEnum(parsed.view1d, ['plot', 'ring'] as const, 'ring');

    const baseScene = ((): SceneStateV1 | null => {
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
            circleLayout: coerceEnum(
              parsed.circleLayout,
              ['radial', 'longitudinal'] as const,
              'radial',
            ),
            playing,
            speed,
            showLattice,
            showSprings,
            config: sanitizeClassical1DPeriodicConfig(configRecord),
          };
        case 'classical:periodic-circle-fixed':
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
            config: sanitizeClassical2DConfig(
              configRecord,
              defaultClassical2DSquareConfig,
            ),
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
            config: sanitizeClassical2DConfig(
              configRecord,
              defaultClassical2DTorusConfig,
            ),
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
        case 'quantum-one-particle:periodic-circle-fixed':
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
            config: sanitizeQuantum2DConfig(
              configRecord,
              defaultQuantum2DSquareConfig,
            ),
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
            config: sanitizeQuantum2DConfig(
              configRecord,
              defaultQuantum2DTorusConfig,
            ),
          };
        default:
          return null;
      }
    })();

    if (baseScene === null) {
      return null;
    }

    return { ...baseScene, view1d };
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
  return `${location.origin}${location.pathname}${buildSceneSearch(
    scene,
    location.search,
    {
      preserveEmbed: options.includeEmbed,
    },
  )}`;
}

function sanitizeClassical1DPeriodicConfig(
  config: Record<string, unknown>,
): Classical1DPeriodicConfig {
  const remapped = remapLegacyClassical1DPreset(config.initialPreset, true);

  return {
    siteCount: coerceInteger(
      config.siteCount,
      defaultClassical1DPeriodicConfig.siteCount,
      8,
      2048,
    ),
    waveSpeed: coerceNumber(
      config.waveSpeed,
      defaultClassical1DPeriodicConfig.waveSpeed,
      {
        min: 0.1,
        max: 5,
      },
    ),
    domainLength: coerceNumber(
      config.domainLength,
      defaultClassical1DPeriodicConfig.domainLength,
      {
        min: 0.1,
        max: 10,
      },
    ),
    amplitude: coerceNumber(
      config.amplitude,
      defaultClassical1DPeriodicConfig.amplitude,
      {
        min: 0.01,
        max: 2,
      },
    ),
    initialCenter: coerceNumber(
      config.initialCenter,
      defaultClassical1DPeriodicConfig.initialCenter,
      {
        min: 0,
        max: 1,
      },
    ),
    gaussianWidth: coerceNumber(
      config.gaussianWidth,
      defaultClassical1DPeriodicConfig.gaussianWidth,
      {
        min: 0.005,
        max: 1,
      },
    ),
    initialPreset: coerceEnum(
      remapped.preset,
      SCENE_CLASSICAL_1D_PERIODIC_PRESETS,
      defaultClassical1DPeriodicConfig.initialPreset,
    ),
    modeNumbers: coerceModeNumbers(
      remapped.legacyModeNumbers ?? config.modeNumbers,
      defaultClassical1DPeriodicConfig.modeNumbers,
      1,
      Math.floor(
        coerceInteger(
          config.siteCount,
          defaultClassical1DPeriodicConfig.siteCount,
          8,
          2048,
        ) / 2,
      ),
    ),
  };
}

function sanitizeClassical1DFixedConfig(
  config: Record<string, unknown>,
): Classical1DFixedConfig {
  const remapped = remapLegacyClassical1DPreset(config.initialPreset, false);

  return {
    siteCount: coerceInteger(
      config.siteCount,
      defaultClassical1DFixedConfig.siteCount,
      4,
      2049,
    ),
    waveSpeed: coerceNumber(
      config.waveSpeed,
      defaultClassical1DFixedConfig.waveSpeed,
      {
        min: 0.1,
        max: 5,
      },
    ),
    domainLength: coerceNumber(
      config.domainLength,
      defaultClassical1DFixedConfig.domainLength,
      {
        min: 0.1,
        max: 10,
      },
    ),
    amplitude: coerceNumber(
      config.amplitude,
      defaultClassical1DFixedConfig.amplitude,
      {
        min: 0.01,
        max: 2,
      },
    ),
    initialCenter: coerceNumber(
      config.initialCenter,
      defaultClassical1DFixedConfig.initialCenter,
      {
        min: 0,
        max: 1,
      },
    ),
    gaussianWidth: coerceNumber(
      config.gaussianWidth,
      defaultClassical1DFixedConfig.gaussianWidth,
      {
        min: 0.005,
        max: 1,
      },
    ),
    // Fixed endpoints reject the periodic-only presets (globally one-way and
    // zero-mean states have no meaning against pinned boundaries), so an old
    // shared scene requesting them falls back to the default.
    initialPreset: coerceEnum(
      remapped.preset,
      CLASSICAL_1D_FIXED_PRESETS,
      defaultClassical1DFixedConfig.initialPreset,
    ),
    modeNumbers: coerceModeNumbers(
      remapped.legacyModeNumbers ?? config.modeNumbers,
      defaultClassical1DFixedConfig.modeNumbers,
      1,
      coerceInteger(
        config.siteCount,
        defaultClassical1DFixedConfig.siteCount,
        4,
        2049,
      ) - 2,
    ),
  };
}

function sanitizeClassical2DConfig(
  config: Record<string, unknown>,
  defaults: Classical2DConfig,
): Classical2DConfig {
  const validPresets =
    defaults.geometry === 'torus-periodic'
      ? CLASSICAL_2D_TORUS_PRESETS.filter(
          // The positive-mean torus velocity bump is engine/test-only; old
          // shared scenes remap onto the zero-mean correction.
          (preset) => preset !== 'central-gaussian-velocity',
        )
      : CLASSICAL_2D_SQUARE_PRESETS;
  const requestedPreset =
    defaults.geometry === 'torus-periodic' &&
    config.initialPreset === 'central-gaussian-velocity'
      ? 'zero-mean-gaussian-velocity'
      : config.initialPreset;

  return {
    geometry: defaults.geometry,
    size: coerceInteger(config.size, defaults.size, 8, 512),
    waveSpeed: coerceNumber(config.waveSpeed, defaults.waveSpeed, {
      min: 0.1,
      max: 5,
    }),
    domainLength: coerceNumber(config.domainLength, defaults.domainLength, {
      min: 0.1,
      max: 10,
    }),
    amplitude: coerceNumber(config.amplitude, defaults.amplitude, {
      min: 0.01,
      max: 2,
    }),
    gaussianWidth: coerceNumber(config.gaussianWidth, defaults.gaussianWidth, {
      min: 0.01,
      max: 1,
    }),
    initialPreset: coerceEnum(
      requestedPreset,
      validPresets,
      defaults.initialPreset,
    ),
  };
}

function sanitizeQuantum1DPeriodicConfig(
  config: Record<string, unknown>,
): Quantum1DPeriodicConfig {
  // Sanitize the lattice size and preset first; the valid mode range is then
  // derived from those sanitized values, never from a fixed maximum.
  const siteCount = coerceInteger(
    config.siteCount,
    defaultQuantum1DPeriodicConfig.siteCount,
    8,
    2048,
  );
  const initialPreset = coerceEnum(
    config.initialPreset,
    QUANTUM_1D_PRESETS,
    defaultQuantum1DPeriodicConfig.initialPreset,
  );
  let modeNumber = clampInteger(
    coerceInteger(
      config.modeNumber,
      defaultQuantum1DPeriodicConfig.modeNumber,
      0,
      siteCount - 1,
    ),
    0,
    siteCount - 1,
  );

  if (
    initialPreset === 'counterpropagating-superposition' &&
    (modeNumber === 0 || (siteCount % 2 === 0 && modeNumber === siteCount / 2))
  ) {
    // Mode zero and the even-lattice Nyquist mode have no distinct opposite.
    modeNumber = 1;
  }

  return {
    siteCount,
    waveSpeed: coerceNumber(
      config.waveSpeed,
      defaultQuantum1DPeriodicConfig.waveSpeed,
      {
        min: 0.1,
        max: 5,
      },
    ),
    domainLength: coerceNumber(
      config.domainLength,
      defaultQuantum1DPeriodicConfig.domainLength,
      {
        min: 0.1,
        max: 10,
      },
    ),
    initialCenter: coerceNumber(
      config.initialCenter,
      defaultQuantum1DPeriodicConfig.initialCenter,
      {
        min: 0,
        max: 1,
      },
    ),
    gaussianWidth: coerceNumber(
      config.gaussianWidth,
      defaultQuantum1DPeriodicConfig.gaussianWidth,
      {
        min: 0.005,
        max: 1,
      },
    ),
    momentumWidth: coerceNumber(
      config.momentumWidth,
      defaultQuantum1DPeriodicConfig.momentumWidth,
      {
        min: 0.1,
        max: 10,
      },
    ),
    modeNumber,
    modeNumbers: coerceModeNumbers(
      config.modeNumbers ?? [modeNumber],
      defaultQuantum1DPeriodicConfig.modeNumbers,
      0,
      siteCount - 1,
    ),
    initialPreset,
  };
}

function sanitizeQuantum1DFixedConfig(
  config: Record<string, unknown>,
): Quantum1DFixedConfig {
  const siteCount = coerceInteger(
    config.siteCount,
    defaultQuantum1DFixedConfig.siteCount,
    4,
    2049,
  );
  const initialPreset = coerceEnum(
    config.initialPreset,
    QUANTUM_1D_PRESETS,
    defaultQuantum1DFixedConfig.initialPreset,
  );
  // Selected sine modes and two-mode standing superpositions require
  // 1 .. siteCount - 2; carrier zero remains valid for a Gaussian.
  const minimumMode =
    initialPreset === 'selected-normal-mode' ||
    initialPreset === 'counterpropagating-superposition'
      ? 1
      : 0;
  const modeNumber = clampInteger(
    coerceInteger(
      config.modeNumber,
      defaultQuantum1DFixedConfig.modeNumber,
      minimumMode,
      siteCount - 2,
    ),
    minimumMode,
    siteCount - 2,
  );

  return {
    siteCount,
    waveSpeed: coerceNumber(
      config.waveSpeed,
      defaultQuantum1DFixedConfig.waveSpeed,
      {
        min: 0.1,
        max: 5,
      },
    ),
    domainLength: coerceNumber(
      config.domainLength,
      defaultQuantum1DFixedConfig.domainLength,
      {
        min: 0.1,
        max: 10,
      },
    ),
    initialCenter: coerceNumber(
      config.initialCenter,
      defaultQuantum1DFixedConfig.initialCenter,
      {
        min: 0,
        max: 1,
      },
    ),
    gaussianWidth: coerceNumber(
      config.gaussianWidth,
      defaultQuantum1DFixedConfig.gaussianWidth,
      {
        min: 0.005,
        max: 1,
      },
    ),
    momentumWidth: coerceNumber(
      config.momentumWidth,
      defaultQuantum1DFixedConfig.momentumWidth,
      {
        min: 0.1,
        max: 10,
      },
    ),
    modeNumber,
    modeNumbers: coerceModeNumbers(
      config.modeNumbers ?? [Math.max(1, modeNumber)],
      defaultQuantum1DFixedConfig.modeNumbers,
      1,
      siteCount - 2,
    ),
    initialPreset,
  };
}

function sanitizeQuantum2DConfig(
  config: Record<string, unknown>,
  defaults: Quantum2DPeriodicConfig | Quantum2DFixedConfig,
): Quantum2DPeriodicConfig | Quantum2DFixedConfig {
  const periodic = defaults === defaultQuantum2DTorusConfig;
  const size = coerceInteger(config.size, defaults.size, 8, 256);
  let initialPreset = coerceEnum(
    config.initialPreset,
    QUANTUM_2D_PRESETS,
    defaults.initialPreset,
  );

  if (!periodic && initialPreset === 'split-superposition') {
    // Topology-incompatible on the Dirichlet square; do not silently present
    // a single standing mode under a split label.
    initialPreset = 'selected-normal-mode';
  }

  const minimumMode = periodic
    ? 0
    : initialPreset === 'selected-normal-mode'
      ? 1
      : 0;
  const maximumMode = periodic ? size - 1 : size - 2;
  let modeNumberX = clampInteger(
    coerceInteger(
      config.modeNumberX,
      defaults.modeNumberX,
      minimumMode,
      maximumMode,
    ),
    minimumMode,
    maximumMode,
  );
  const modeNumberY = clampInteger(
    coerceInteger(
      config.modeNumberY,
      defaults.modeNumberY,
      minimumMode,
      maximumMode,
    ),
    minimumMode,
    maximumMode,
  );

  if (
    periodic &&
    initialPreset === 'split-superposition' &&
    (modeNumberX === 0 || (size % 2 === 0 && modeNumberX === size / 2))
  ) {
    // The +kx / -kx branches must be distinct; ky = 0 stays valid.
    modeNumberX = 1;
  }

  return {
    size,
    waveSpeed: coerceNumber(config.waveSpeed, defaults.waveSpeed, {
      min: 0.1,
      max: 5,
    }),
    domainLength: coerceNumber(config.domainLength, defaults.domainLength, {
      min: 0.1,
      max: 10,
    }),
    initialCenterX: coerceNumber(
      config.initialCenterX,
      defaults.initialCenterX,
      { min: 0, max: 1 },
    ),
    initialCenterY: coerceNumber(
      config.initialCenterY,
      defaults.initialCenterY,
      { min: 0, max: 1 },
    ),
    gaussianWidth: coerceNumber(config.gaussianWidth, defaults.gaussianWidth, {
      min: 0.01,
      max: 1,
    }),
    momentumWidth: coerceNumber(config.momentumWidth, defaults.momentumWidth, {
      min: 0.1,
      max: 10,
    }),
    modeNumberX,
    modeNumberY,
    initialPreset,
  };
}

/**
 * Maps retired serialized preset identifiers onto their modern equivalents so
 * old shared URLs keep loading: the numbered standing modes became the
 * multi-select 'standing-modes' preset, and the positive-mean Gaussian
 * velocity (which excites the periodic uniform mode) is replaced by its
 * zero-mean correction on periodic topologies.
 */
function remapLegacyClassical1DPreset(
  value: unknown,
  periodic: boolean,
): { preset: unknown; legacyModeNumbers: readonly number[] | null } {
  if (value === 'standing-mode-1') {
    return { preset: 'standing-modes', legacyModeNumbers: [1] };
  }

  if (value === 'standing-mode-2') {
    return { preset: 'standing-modes', legacyModeNumbers: [2] };
  }

  if (periodic && value === 'gaussian-velocity') {
    return { preset: 'zero-mean-gaussian-velocity', legacyModeNumbers: null };
  }

  return { preset: value, legacyModeNumbers: null };
}

/** Coerces a serialized mode-number list: integers in range, deduplicated,
 * sorted; falls back when empty or malformed. */
function coerceModeNumbers(
  value: unknown,
  fallback: readonly number[],
  min: number,
  max: number,
): readonly number[] {
  const source = Array.isArray(value) ? value : fallback;
  const cleaned = [
    ...new Set(
      source.filter(
        (entry): entry is number =>
          typeof entry === 'number' &&
          Number.isInteger(entry) &&
          entry >= min &&
          entry <= max,
      ),
    ),
  ].sort((a, b) => a - b);

  if (cleaned.length > 0) {
    return cleaned;
  }

  const fallbackCleaned = fallback.filter(
    (entry) => entry >= min && entry <= max,
  );
  return fallbackCleaned.length > 0 ? fallbackCleaned : [Math.max(1, min)];
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getDefaultShowLattice(mode: AppMode, geometry: Geometry): boolean {
  if (mode === 'classical') {
    return (
      geometry === 'periodic-circle' ||
      geometry === 'periodic-circle-fixed' ||
      geometry === 'fixed-interval'
    );
  }

  return (
    geometry === 'periodic-circle' ||
    geometry === 'periodic-circle-fixed' ||
    geometry === 'fixed-interval'
  );
}

function getDefaultShowSprings(mode: AppMode, geometry: Geometry): boolean {
  return (
    mode === 'classical' &&
    (geometry === 'periodic-circle' ||
      geometry === 'periodic-circle-fixed' ||
      geometry === 'fixed-interval')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
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
  return typeof value === 'string' && validValues.includes(value as T)
    ? (value as T)
    : fallback;
}
