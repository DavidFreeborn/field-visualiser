import type { Classical1DPeriodicDiagnostics } from '../../physics/classical/classical1dPeriodic';
import type { Classical1DFixedDiagnostics } from '../../physics/classical/classical1dFixed';

interface DiagnosticsPanelProps {
  readonly diagnostics: Classical1DPeriodicDiagnostics | Classical1DFixedDiagnostics;
  readonly time: number;
  readonly siteCount: number;
  readonly quantityLabel: string;
  readonly systemLabel: string;
  readonly boundaryLabel: string;
}

export function DiagnosticsPanel({
  diagnostics,
  time,
  siteCount,
  quantityLabel,
  systemLabel,
  boundaryLabel,
}: DiagnosticsPanelProps): React.JSX.Element {
  return (
    <section className="diagnostics-panel">
      <div className="diagnostics-header">
        <h2>Diagnostics</h2>
        <p>
          Conservative periodic chain in dimensionless units. Total energy is the
          spatial integral of the displayed local energy density.
        </p>
      </div>
      <dl className="diagnostics-grid">
        <div>
          <dt>System</dt>
          <dd>{systemLabel}</dd>
        </div>
        <div>
          <dt>Boundary</dt>
          <dd>{boundaryLabel}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>Classical field</dd>
        </div>
        <div>
          <dt>Resolution</dt>
          <dd>{siteCount} sites</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>{quantityLabel}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{time.toFixed(3)}</dd>
        </div>
        <div>
          <dt>Total energy</dt>
          <dd>{diagnostics.totalEnergy.toFixed(6)}</dd>
        </div>
        <div>
          <dt>Relative drift</dt>
          <dd>{diagnostics.relativeEnergyDrift.toExponential(2)}</dd>
        </div>
        <div>
          <dt>Recommended dt</dt>
          <dd>{diagnostics.recommendedDt.toFixed(4)}</dd>
        </div>
        <div>
          <dt>CFL ratio</dt>
          <dd>{diagnostics.stabilityRatio.toFixed(2)}</dd>
        </div>
      </dl>
    </section>
  );
}
