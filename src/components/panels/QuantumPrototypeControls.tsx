import { ModeSwitch, type AppMode } from './ModeSwitch';
import type {
  Quantum1DPeriodicConfig,
  Quantum1DPeriodicQuantity,
} from '../../physics/quantum/quantum1dPeriodic';
import type { PeriodicQuantumInitialPreset } from '../../physics/quantum/initialStates';

interface QuantumPrototypeControlsProps {
  readonly mode: AppMode;
  readonly config: Quantum1DPeriodicConfig;
  readonly quantity: Quantum1DPeriodicQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly onModeChange: (mode: AppMode) => void;
  readonly onConfigChange: (nextConfig: Quantum1DPeriodicConfig) => void;
  readonly onQuantityChange: (quantity: Quantum1DPeriodicQuantity) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onReset: () => void;
  readonly onStep: () => void;
  readonly onSpeedChange: (speed: number) => void;
  readonly onShowLatticeChange: (showLattice: boolean) => void;
}

const resolutionOptions = [32, 64, 128, 256] as const;

const initialPresetLabels: Record<PeriodicQuantumInitialPreset, string> = {
  'site-localized': 'Site-localized state',
  'gaussian-wavepacket': 'Gaussian wavepacket',
  'selected-normal-mode': 'Selected normal mode',
  'counterpropagating-superposition': 'Counterpropagating superposition',
};

export function QuantumPrototypeControls({
  mode,
  config,
  quantity,
  playing,
  speed,
  showLattice,
  onModeChange,
  onConfigChange,
  onQuantityChange,
  onPlayingChange,
  onReset,
  onStep,
  onSpeedChange,
  onShowLatticeChange,
}: QuantumPrototypeControlsProps): React.JSX.Element {
  return (
    <section className="control-panel">
      <div className="control-header">
        <div>
          <p className="eyebrow">Phase 3 Prototype</p>
          <h2>1D periodic free-field one-particle mode</h2>
        </div>
        <p className="control-note">
          Free-field one-particle quantum pedagogical mode. The evolved Hilbert
          space is the one-particle sector of the periodic lattice: one complex
          amplitude per site, advanced exactly in the normal-mode basis.
        </p>
      </div>

      <div className="control-grid">
        <ModeSwitch
          mode={mode}
          onModeChange={onModeChange}
        />

        <label>
          <span>Initial state</span>
          <select
            value={config.initialPreset}
            onChange={(event) =>
              onConfigChange({
                ...config,
                initialPreset: event.target.value as PeriodicQuantumInitialPreset,
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
          <span>Displayed quantity</span>
          <select
            value={quantity}
            onChange={(event) =>
              onQuantityChange(event.target.value as Quantum1DPeriodicQuantity)
            }
          >
            <option value="probability-density">Probability density</option>
            <option value="magnitude">Magnitude |psi|</option>
            <option value="real-part">Real part</option>
            <option value="imaginary-part">Imaginary part</option>
          </select>
        </label>

        <label>
          <span>Carrier mode</span>
          <input
            aria-label="Carrier mode"
            max={12}
            min={0}
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
