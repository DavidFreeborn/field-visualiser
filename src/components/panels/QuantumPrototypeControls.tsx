import { ModeSwitch, type AppMode } from './ModeSwitch';
import { GeometrySwitch, type Geometry1D } from './GeometrySwitch';
import type {
  Quantum1DPeriodicConfig,
  Quantum1DPeriodicQuantity,
} from '../../physics/quantum/quantum1dPeriodic';
import type { Quantum1DFixedConfig, Quantum1DFixedQuantity } from '../../physics/quantum/quantum1dFixed';
import type { Quantum1DInitialPreset } from '../../physics/quantum/initialStates';

interface QuantumPrototypeControlsProps {
  readonly mode: AppMode;
  readonly geometry: Geometry1D;
  readonly config: Quantum1DPeriodicConfig | Quantum1DFixedConfig;
  readonly quantity: Quantum1DPeriodicQuantity | Quantum1DFixedQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly onModeChange: (mode: AppMode) => void;
  readonly onGeometryChange: (geometry: Geometry1D) => void;
  readonly onConfigChange: (nextConfig: Quantum1DPeriodicConfig | Quantum1DFixedConfig) => void;
  readonly onQuantityChange: (quantity: Quantum1DPeriodicQuantity | Quantum1DFixedQuantity) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onReset: () => void;
  readonly onStep: () => void;
  readonly onSpeedChange: (speed: number) => void;
  readonly onShowLatticeChange: (showLattice: boolean) => void;
}

const resolutionOptions = [32, 64, 128, 256] as const;

const initialPresetLabels: Record<Quantum1DInitialPreset, string> = {
  'site-localized': 'Site-localized state',
  'gaussian-wavepacket': 'Gaussian wavepacket',
  'selected-normal-mode': 'Selected normal mode',
  'counterpropagating-superposition': 'Counterpropagating superposition',
};

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
}: QuantumPrototypeControlsProps): React.JSX.Element {
  return (
    <section className="control-panel">
      <div className="control-header">
        <div>
          <p className="eyebrow">Phase 3 Prototype</p>
          <h2>
            {geometry === 'periodic-circle'
              ? '1D periodic free-field one-particle mode'
              : '1D fixed-end free-field one-particle mode'}
          </h2>
        </div>
        <p className="control-note">
          {geometry === 'periodic-circle'
            ? 'Free-field one-particle quantum pedagogical mode on the periodic lattice Hilbert space.'
            : 'Free-field one-particle quantum pedagogical mode on the fixed-end interval Hilbert space with zero endpoint amplitudes.'}
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
          <span>Initial state</span>
          <select
            value={config.initialPreset}
            onChange={(event) =>
              onConfigChange({
                ...config,
                initialPreset: event.target.value as Quantum1DInitialPreset,
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
              onQuantityChange(
                event.target.value as Quantum1DPeriodicQuantity | Quantum1DFixedQuantity,
              )
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
