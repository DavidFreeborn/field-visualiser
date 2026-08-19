import type {
  Quantum2DFixedConfig,
  Quantum2DFixedQuantity,
} from '../../physics/quantum/quantum2dFixed';
import type {
  Quantum2DPeriodicConfig,
  Quantum2DPeriodicQuantity,
} from '../../physics/quantum/quantum2dPeriodic';
import type { Quantum2DInitialPreset } from '../../physics/quantum/initialStates2d';
import { GeometrySwitch, type Geometry2D } from './GeometrySwitch';
import { ModeSwitch, type AppMode } from './ModeSwitch';

type Quantum2DConfig = Quantum2DFixedConfig | Quantum2DPeriodicConfig;
type Quantum2DQuantity = Quantum2DFixedQuantity | Quantum2DPeriodicQuantity;

interface Quantum2DControlsProps {
  readonly mode: AppMode;
  readonly geometry: Geometry2D;
  readonly config: Quantum2DConfig;
  readonly quantity: Quantum2DQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly onModeChange: (mode: AppMode) => void;
  readonly onGeometryChange: (geometry: Geometry2D) => void;
  readonly onConfigChange: (config: Quantum2DConfig) => void;
  readonly onQuantityChange: (quantity: Quantum2DQuantity) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onReset: () => void;
  readonly onStep: () => void;
  readonly onSpeedChange: (speed: number) => void;
  readonly onShowLatticeChange: (showLattice: boolean) => void;
}

const torusResolutionOptions = [16, 24, 32, 40, 48, 64, 80, 96] as const;
const squareResolutionOptions = [17, 25, 33, 41, 49, 65, 81] as const;

const initialPresetLabels: Record<Quantum2DInitialPreset, string> = {
  'site-localized': 'Site-localised state',
  'gaussian-wavepacket': 'Gaussian packet',
  'selected-normal-mode': 'Selected normal mode',
  'split-superposition': 'Split superposition',
};

export function Quantum2DControls({
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
}: Quantum2DControlsProps): React.JSX.Element {
  const allowedPresets: Quantum2DInitialPreset[] =
    geometry === 'torus-periodic'
      ? [
          'site-localized',
          'gaussian-wavepacket',
          'selected-normal-mode',
          'split-superposition',
        ]
      : ['site-localized', 'gaussian-wavepacket', 'selected-normal-mode'];
  const resolutionOptions =
    geometry === 'torus-periodic'
      ? torusResolutionOptions
      : squareResolutionOptions;
  // A split superposition needs distinct +kx/-kx branches, so kx >= 1 (ky = 0
  // stays valid); square normal modes need both components >= 1.
  const modeSliderMinX =
    config.initialPreset === 'split-superposition' ||
    (geometry === 'square-fixed' &&
      config.initialPreset === 'selected-normal-mode')
      ? 1
      : 0;
  const modeSliderMinY =
    geometry === 'square-fixed' &&
    config.initialPreset === 'selected-normal-mode'
      ? 1
      : 0;

  return (
    <section className="control-panel">
      <div className="control-header">
        <p className="control-note">
          {geometry === 'torus-periodic'
            ? 'Exact separable phase evolution in a 2D periodic normal-mode basis on a flat square domain with opposite edges identified.'
            : 'Exact separable sine-mode phase evolution on a 2D square with fixed zero boundary amplitudes.'}
        </p>
      </div>

      <div className="control-grid">
        <ModeSwitch mode={mode} onModeChange={onModeChange} />
        <GeometrySwitch
          geometry={geometry}
          mode={mode}
          onGeometryChange={(next) => onGeometryChange(next as Geometry2D)}
        />
        <label>
          <span>Initial state</span>
          <select
            value={config.initialPreset}
            onChange={(event) => {
              const nextPreset = event.target.value as Quantum2DInitialPreset;
              // Adjust an existing invalid mode before it reaches the engine:
              // a split needs distinct +kx/-kx branches (kx != 0), and square
              // normal modes need both components >= 1.
              const needsNonZeroX =
                nextPreset === 'split-superposition' ||
                (geometry === 'square-fixed' &&
                  nextPreset === 'selected-normal-mode');
              const needsNonZeroY =
                geometry === 'square-fixed' &&
                nextPreset === 'selected-normal-mode';
              onConfigChange({
                ...config,
                initialPreset: nextPreset,
                modeNumberX:
                  needsNonZeroX && config.modeNumberX === 0
                    ? 1
                    : config.modeNumberX,
                modeNumberY:
                  needsNonZeroY && config.modeNumberY === 0
                    ? 1
                    : config.modeNumberY,
              });
            }}
          >
            {allowedPresets.map((preset) => (
              <option key={preset} value={preset}>
                {initialPresetLabels[preset]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Lattice density</span>
          <select
            value={config.size}
            onChange={(event) =>
              onConfigChange({
                ...config,
                size: Number(event.target.value),
              })
            }
          >
            {resolutionOptions.map((size) => (
              <option key={size} value={size}>
                {`${size} × ${size}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Displayed quantity</span>
          <select
            value={quantity}
            onChange={(event) =>
              onQuantityChange(event.target.value as Quantum2DQuantity)
            }
          >
            <option value="probability-density">Site probability |ψᵢ|²</option>
            <option value="magnitude">Magnitude |ψ|</option>
            <option value="real-part">Real part</option>
            <option value="imaginary-part">Imaginary part</option>
            <option value="phase-magnitude">
              Complex amplitude (phase + magnitude)
            </option>
          </select>
        </label>
        <label>
          <span>Mode x</span>
          <input
            aria-label="Mode x"
            max={6}
            min={modeSliderMinX}
            step={1}
            type="range"
            value={config.modeNumberX}
            onChange={(event) =>
              onConfigChange({
                ...config,
                modeNumberX: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          <span>Mode y</span>
          <input
            aria-label="Mode y"
            max={6}
            min={modeSliderMinY}
            step={1}
            type="range"
            value={config.modeNumberY}
            onChange={(event) =>
              onConfigChange({
                ...config,
                modeNumberY: Number(event.target.value),
              })
            }
          />
        </label>
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
          <span>Show lattice overlay</span>
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
