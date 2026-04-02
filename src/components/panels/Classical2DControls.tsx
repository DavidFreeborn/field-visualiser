import type {
  Classical2DConfig,
  Classical2DInitialPreset,
  Classical2DQuantity,
} from '../../physics/classical/classical2d';
import { GeometrySwitch, type Geometry2D } from './GeometrySwitch';
import { ModeSwitch, type AppMode } from './ModeSwitch';

interface Classical2DControlsProps {
  readonly mode: AppMode;
  readonly geometry: Geometry2D;
  readonly config: Classical2DConfig;
  readonly quantity: Classical2DQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly onModeChange: (mode: AppMode) => void;
  readonly onGeometryChange: (geometry: Geometry2D) => void;
  readonly onConfigChange: (config: Classical2DConfig) => void;
  readonly onQuantityChange: (quantity: Classical2DQuantity) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onReset: () => void;
  readonly onStep: () => void;
  readonly onSpeedChange: (speed: number) => void;
  readonly onShowLatticeChange: (showLattice: boolean) => void;
}

const resolutionOptions = [24, 32, 48, 64] as const;

const initialPresetLabels: Record<Classical2DInitialPreset, string> = {
  'central-gaussian-displacement': 'Central Gaussian displacement',
  'central-gaussian-velocity': 'Central Gaussian velocity',
  'square-standing-mode-1-1': 'Low standing mode (1,1)',
  'wraparound-pulse': 'Wraparound pulse',
  'compact-pulse': 'Compact localized pulse',
};

export function Classical2DControls({
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
}: Classical2DControlsProps): React.JSX.Element {
  const allowedPresets: Classical2DInitialPreset[] =
    geometry === 'square-fixed'
      ? [
          'central-gaussian-displacement',
          'central-gaussian-velocity',
          'square-standing-mode-1-1',
          'compact-pulse',
        ]
      : [
          'central-gaussian-displacement',
          'central-gaussian-velocity',
          'wraparound-pulse',
          'compact-pulse',
        ];

  return (
    <section className="control-panel">
      <div className="control-header">
        <div>
          <p className="eyebrow">Phase 5 Prototype</p>
          <h2>{geometry === 'square-fixed' ? '2D square classical membrane' : '2D torus classical membrane'}</h2>
        </div>
        <p className="control-note">
          {geometry === 'square-fixed'
            ? 'Nearest-neighbour 2D lattice with fixed zero boundaries on all edges.'
            : 'Nearest-neighbour 2D lattice on a flat periodic domain with opposite edges identified.'}
        </p>
      </div>

      <div className="control-grid">
        <ModeSwitch
          mode={mode}
          onModeChange={onModeChange}
        />
        <GeometrySwitch
          geometry={geometry}
          mode={mode}
          onGeometryChange={(next) => onGeometryChange(next as Geometry2D)}
        />
        <label>
          <span>Initial condition</span>
          <select
            value={config.initialPreset}
            onChange={(event) =>
              onConfigChange({
                ...config,
                initialPreset: event.target.value as Classical2DInitialPreset,
              })
            }
          >
            {allowedPresets.map((preset: Classical2DInitialPreset) => (
              <option
                key={preset}
                value={preset}
              >
                {initialPresetLabels[preset]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Resolution</span>
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
              <option
                key={size}
                value={size}
              >
                {size} × {size}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Quantity</span>
          <select
            value={quantity}
            onChange={(event) => onQuantityChange(event.target.value as Classical2DQuantity)}
          >
            <option value="displacement">Displacement</option>
            <option value="velocity">Velocity</option>
            <option value="energy-density">Local energy density</option>
          </select>
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
        <button
          className="secondary-button"
          type="button"
          onClick={onStep}
        >
          Single step
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
