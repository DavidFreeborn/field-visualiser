import type {
  Classical1DPeriodicConfig,
  Classical1DPeriodicQuantity,
} from '../../physics/classical/classical1dPeriodic';
import type { PeriodicClassicalInitialPreset } from '../../physics/classical/initialConditions';

interface PrototypeControlsProps {
  readonly config: Classical1DPeriodicConfig;
  readonly quantity: Classical1DPeriodicQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly onConfigChange: (nextConfig: Classical1DPeriodicConfig) => void;
  readonly onQuantityChange: (quantity: Classical1DPeriodicQuantity) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onReset: () => void;
  readonly onStep: () => void;
  readonly onSpeedChange: (speed: number) => void;
  readonly onShowLatticeChange: (showLattice: boolean) => void;
  readonly onShowSpringsChange: (showSprings: boolean) => void;
}

const resolutionOptions = [32, 64, 128, 256] as const;

const initialPresetLabels: Record<PeriodicClassicalInitialPreset, string> = {
  'gaussian-displacement': 'Gaussian displacement',
  'gaussian-velocity': 'Gaussian velocity',
  'single-site-displacement': 'Single-site displacement',
  'standing-mode-2': 'Standing mode n = 2',
};

export function PrototypeControls({
  config,
  quantity,
  playing,
  speed,
  showLattice,
  showSprings,
  onConfigChange,
  onQuantityChange,
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
        <div>
          <p className="eyebrow">Phase 2 Prototype</p>
          <h2>1D periodic classical lattice</h2>
        </div>
        <p className="control-note">
          Symplectic time stepping on a nearest-neighbour periodic chain. This
          is the first validated system before broader generalisation.
        </p>
      </div>

      <div className="control-grid">
        <label>
          <span>Initial condition</span>
          <select
            value={config.initialPreset}
            onChange={(event) =>
              onConfigChange({
                ...config,
                initialPreset: event.target.value as PeriodicClassicalInitialPreset,
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
          <span>Resolution</span>
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
                {siteCount} sites
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
