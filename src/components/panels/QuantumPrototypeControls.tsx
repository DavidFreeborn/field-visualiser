import { ModeNumberPicker } from './ModeNumberPicker';
import { ModeSwitch, type AppMode } from './ModeSwitch';
import { GeometrySwitch, type Geometry1D } from './GeometrySwitch';
import type {
  Quantum1DPeriodicConfig,
  Quantum1DPeriodicQuantity,
} from '../../physics/quantum/quantum1dPeriodic';
import type {
  Quantum1DFixedConfig,
  Quantum1DFixedQuantity,
} from '../../physics/quantum/quantum1dFixed';
import type { Quantum1DInitialPreset } from '../../physics/quantum/initialStates';

interface QuantumPrototypeControlsProps {
  readonly mode: AppMode;
  readonly geometry: Geometry1D;
  readonly config: Quantum1DPeriodicConfig | Quantum1DFixedConfig;
  readonly quantity: Quantum1DPeriodicQuantity | Quantum1DFixedQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly view1d: 'plot' | 'ring';
  readonly onModeChange: (mode: AppMode) => void;
  readonly onGeometryChange: (geometry: Geometry1D) => void;
  readonly onConfigChange: (
    nextConfig: Quantum1DPeriodicConfig | Quantum1DFixedConfig,
  ) => void;
  readonly onQuantityChange: (
    quantity: Quantum1DPeriodicQuantity | Quantum1DFixedQuantity,
  ) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onReset: () => void;
  readonly onStep: () => void;
  readonly onSpeedChange: (speed: number) => void;
  readonly onShowLatticeChange: (showLattice: boolean) => void;
  readonly onView1dChange: (view: 'plot' | 'ring') => void;
}

const resolutionOptions = [32, 64, 128, 256, 512, 1024, 2048];

// The active value may come from a preset or shared URL that is not one of
// the listed options (e.g. 129 or 513 on the fixed interval); include it so
// the select always displays the true site count.
function getResolutionOptions(current: number): number[] {
  return resolutionOptions.includes(current)
    ? resolutionOptions
    : [...resolutionOptions, current].sort((a, b) => a - b);
}

const periodicPresetLabels: Record<Quantum1DInitialPreset, string> = {
  'site-localized': 'Site-localised state',
  'gaussian-wavepacket': 'Gaussian wavepacket',
  'selected-normal-mode': 'Normal-mode superposition',
  'counterpropagating-superposition': 'Counterpropagating superposition',
};

// On the Dirichlet interval the two-mode preset is a standing superposition;
// nothing propagates one way against pinned endpoints.
const fixedPresetLabels: Record<Quantum1DInitialPreset, string> = {
  'site-localized': 'Site-localised state',
  'gaussian-wavepacket': 'Gaussian wavepacket',
  'selected-normal-mode': 'Normal-mode superposition',
  'counterpropagating-superposition': 'Two-mode standing superposition',
};

// Modes offered by the normal-mode superposition picker: the periodic lattice
// includes the static zero mode; Dirichlet sine modes start at n = 1.
const PERIODIC_NORMAL_MODE_OPTIONS: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
];
const FIXED_NORMAL_MODE_OPTIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Adjusts an existing invalid carrier mode when the preset changes, so
 * selecting e.g. the counterpropagating preset while the carrier is zero
 * produces a valid distinct-mode pair instead of an engine error.
 */
function correctModeForPreset(
  preset: Quantum1DInitialPreset,
  modeNumber: number,
  siteCount: number,
  fixedGeometry: boolean,
): number {
  if (preset === 'counterpropagating-superposition') {
    if (modeNumber === 0) {
      return 1;
    }

    if (!fixedGeometry && siteCount % 2 === 0 && modeNumber === siteCount / 2) {
      return 1;
    }

    if (fixedGeometry && modeNumber > siteCount - 2) {
      return siteCount - 2;
    }
  }

  return modeNumber;
}

export function QuantumPrototypeControls({
  mode,
  geometry,
  config,
  quantity,
  playing,
  speed,
  showLattice,
  onModeChange,
  onGeometryChange,
  onConfigChange,
  onQuantityChange,
  onPlayingChange,
  onReset,
  onStep,
  onSpeedChange,
  onShowLatticeChange,
  view1d,
  onView1dChange,
}: QuantumPrototypeControlsProps): React.JSX.Element {
  const fixedGeometry = geometry === 'fixed-interval';
  const presetLabels = fixedGeometry ? fixedPresetLabels : periodicPresetLabels;
  const modeSliderMin =
    config.initialPreset === 'counterpropagating-superposition' ? 1 : 0;
  // The carrier slider only affects the wavepacket and counterpropagating
  // presets; the normal-mode superposition uses the checkbox picker instead.
  const showCarrierSlider =
    config.initialPreset === 'gaussian-wavepacket' ||
    config.initialPreset === 'counterpropagating-superposition';

  return (
    <section className="control-panel">
      <div className="control-header">
        <p className="control-note">
          {geometry === 'periodic-circle'
            ? 'Square-root lattice quantum model on the periodic lattice, shown on a deforming circular embedding.'
            : geometry === 'periodic-circle-fixed'
              ? 'Square-root lattice quantum model on the periodic lattice, shown on a fixed circular domain with color encoding.'
              : 'Square-root lattice quantum model on a fixed-end interval with zero endpoint amplitudes.'}
        </p>
      </div>

      <div className="control-grid">
        <ModeSwitch mode={mode} onModeChange={onModeChange} />

        <GeometrySwitch
          geometry={geometry}
          mode={mode}
          onGeometryChange={(next) => onGeometryChange(next as Geometry1D)}
        />

        <label>
          <span>Initial state</span>
          <select
            value={config.initialPreset}
            onChange={(event) => {
              const nextPreset = event.target.value as Quantum1DInitialPreset;
              onConfigChange({
                ...config,
                initialPreset: nextPreset,
                modeNumber: correctModeForPreset(
                  nextPreset,
                  config.modeNumber,
                  config.siteCount,
                  fixedGeometry,
                ),
              });
            }}
          >
            {Object.entries(presetLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {config.initialPreset === 'selected-normal-mode' ? (
          <ModeNumberPicker
            label="Normal modes n"
            options={
              fixedGeometry
                ? FIXED_NORMAL_MODE_OPTIONS
                : PERIODIC_NORMAL_MODE_OPTIONS
            }
            selected={config.modeNumbers}
            onChange={(modeNumbers) =>
              onConfigChange({ ...config, modeNumbers })
            }
          />
        ) : null}

        <label>
          <span>Lattice density</span>
          <select
            value={config.siteCount}
            onChange={(event) =>
              onConfigChange({
                ...config,
                siteCount: Number(event.target.value),
              })
            }
          >
            {getResolutionOptions(config.siteCount).map((siteCount) => (
              <option key={siteCount} value={siteCount}>
                {`${siteCount} sites`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Displayed quantity</span>
          <select
            value={quantity}
            onChange={(event) =>
              onQuantityChange(
                event.target.value as
                  | Quantum1DPeriodicQuantity
                  | Quantum1DFixedQuantity,
              )
            }
          >
            <option value="probability-density">Site probability |ψᵢ|²</option>
            <option value="magnitude">Magnitude |ψ|</option>
            <option value="real-part">Real part</option>
            <option value="imaginary-part">Imaginary part</option>
            <option value="real-imaginary-parts">
              Real and imaginary parts
            </option>
            <option value="phase-magnitude">
              Complex amplitude (phase + magnitude)
            </option>
          </select>
        </label>

        {showCarrierSlider ? (
          <label>
            <span>Carrier mode</span>
            <input
              aria-label="Carrier mode"
              max={12}
              min={modeSliderMin}
              step={1}
              type="range"
              value={config.modeNumber}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  modeNumber: Number(event.target.value),
                })
              }
            />
          </label>
        ) : null}

        {!fixedGeometry ? (
          <label>
            <span>1D representation</span>
            <select
              value={view1d}
              onChange={(event) =>
                onView1dChange(event.target.value as 'plot' | 'ring')
              }
            >
              <option value="ring">Circle (topology, default)</option>
              <option value="plot">Unwrapped plot (analysis view)</option>
            </select>
          </label>
        ) : null}

        <label>
          <span>Speed</span>
          <input
            aria-label="Simulation speed"
            max={2.5}
            min={0.1}
            step={0.1}
            type="range"
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="toggle-row">
        <label className="toggle">
          <input
            checked={showLattice}
            type="checkbox"
            onChange={(event) => onShowLatticeChange(event.target.checked)}
          />
          <span>Show lattice sites</span>
        </label>
      </div>

      <div className="button-row">
        <button
          className="primary-button"
          type="button"
          onClick={() => onPlayingChange(!playing)}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button className="secondary-button" type="button" onClick={onStep}>
          Single step
        </button>
        <button className="secondary-button" type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </section>
  );
}
