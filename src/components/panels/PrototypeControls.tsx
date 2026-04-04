import type {
  Classical1DPeriodicConfig,
  Classical1DPeriodicQuantity,
} from '../../physics/classical/classical1dPeriodic';
import type { Classical1DFixedConfig } from '../../physics/classical/classical1dFixed';
import type { Classical1DInitialPreset } from '../../physics/classical/initialConditions';
import { ModeSwitch, type AppMode } from './ModeSwitch';
import { GeometrySwitch, type Geometry1D } from './GeometrySwitch';

interface PrototypeControlsProps {
  readonly mode: AppMode;
  readonly geometry: Geometry1D;
  readonly config: Classical1DPeriodicConfig | Classical1DFixedConfig;
  readonly quantity: Classical1DPeriodicQuantity;
  readonly circleLayout: 'radial' | 'longitudinal';
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly onModeChange: (mode: AppMode) => void;
  readonly onGeometryChange: (geometry: Geometry1D) => void;
  readonly onConfigChange: (nextConfig: Classical1DPeriodicConfig | Classical1DFixedConfig) => void;
  readonly onQuantityChange: (quantity: Classical1DPeriodicQuantity) => void;
  readonly onCircleLayoutChange: (layout: 'radial' | 'longitudinal') => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onReset: () => void;
  readonly onStep: () => void;
  readonly onSpeedChange: (speed: number) => void;
  readonly onShowLatticeChange: (showLattice: boolean) => void;
  readonly onShowSpringsChange: (showSprings: boolean) => void;
}

const resolutionOptions = [32, 64, 128, 256, 512, 1024, 2048] as const;

const initialPresetLabels: Record<Classical1DInitialPreset, string> = {
  'gaussian-displacement': 'Gaussian displacement',
  'gaussian-velocity': 'Gaussian velocity',
  'single-site-displacement': 'Single-site displacement',
  'standing-mode-1': 'Standing mode n = 1',
  'standing-mode-2': 'Standing mode n = 2',
};

export function PrototypeControls({
  mode,
  geometry,
  config,
  quantity,
  circleLayout,
  playing,
  speed,
  showLattice,
  showSprings,
  onModeChange,
  onGeometryChange,
  onConfigChange,
  onQuantityChange,
  onCircleLayoutChange,
  onPlayingChange,
  onReset,
  onStep,
  onSpeedChange,
  onShowLatticeChange,
  onShowSpringsChange,
}: PrototypeControlsProps): React.JSX.Element {
  return (
    <section className="control-panel">
      <div className="control-header">
        <p className="control-note">
          {geometry === 'periodic-circle'
            ? 'Classical nearest-neighbour ring with periodic wraparound, shown as a deforming circular embedding.'
            : geometry === 'periodic-circle-fixed'
              ? 'Classical nearest-neighbour ring with periodic wraparound, shown on a fixed circular domain with color encoding.'
              : 'Classical nearest-neighbour line with fixed zero endpoints.'}
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
          onGeometryChange={(next) => onGeometryChange(next as Geometry1D)}
        />

        <label>
          <span>Initial condition</span>
          <select
            value={config.initialPreset}
            onChange={(event) =>
              onConfigChange({
                ...config,
                initialPreset: event.target.value as Classical1DInitialPreset,
              })
            }
          >
            {Object.entries(initialPresetLabels).map(([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Oscillator density</span>
          <select
            value={config.siteCount}
            onChange={(event) =>
              onConfigChange({
                ...config,
                siteCount: Number(event.target.value),
              })
            }
          >
            {resolutionOptions.map((siteCount) => (
              <option
                key={siteCount}
                value={siteCount}
              >
                {siteCount === 2048 ? `Almost continuum (${siteCount} oscillators)` : `${siteCount} oscillators`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Quantity</span>
          <select
            value={quantity}
            onChange={(event) =>
              onQuantityChange(event.target.value as Classical1DPeriodicQuantity)
            }
          >
            <option value="displacement">Displacement</option>
            <option value="velocity">Velocity</option>
            <option value="energy-density">Local energy density</option>
          </select>
        </label>

        {geometry === 'periodic-circle' ? (
          <label>
            <span>Circle motion</span>
            <select
              value={circleLayout}
              onChange={(event) =>
                onCircleLayoutChange(event.target.value as 'radial' | 'longitudinal')
              }
            >
              <option value="radial">Radial</option>
              <option value="longitudinal">Longitudinal</option>
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
          <span>Show oscillator sites</span>
        </label>

        <label className="toggle">
          <input
            checked={showSprings}
            type="checkbox"
            onChange={(event) => onShowSpringsChange(event.target.checked)}
          />
          <span>Show bond hints</span>
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
