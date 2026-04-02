import type { Quantum1DPeriodicDiagnostics } from '../../physics/quantum/quantum1dPeriodic';
import type { Quantum1DFixedDiagnostics } from '../../physics/quantum/quantum1dFixed';

interface QuantumDiagnosticsPanelProps {
  readonly diagnostics: Quantum1DPeriodicDiagnostics | Quantum1DFixedDiagnostics;
  readonly time: number;
  readonly siteCount: number;
  readonly quantityLabel: string;
  readonly systemLabel: string;
  readonly boundaryLabel: string;
}

export function QuantumDiagnosticsPanel({
  diagnostics,
  time,
  siteCount,
  quantityLabel,
  systemLabel,
  boundaryLabel,
}: QuantumDiagnosticsPanelProps): React.JSX.Element {
  return (
    <section className="diagnostics-panel">
      <div className="diagnostics-header">
        <h2>Diagnostics</h2>
        <p>
          Free-field one-particle pedagogical visualisation on a periodic
          lattice. The red regions show probability density, not a little
          classical particle blob.
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
          <dd>Free-field one-particle</dd>
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
          <dt>Total norm</dt>
          <dd>{diagnostics.totalNorm.toFixed(6)}</dd>
        </div>
        <div>
          <dt>Norm error</dt>
          <dd>{diagnostics.normError.toExponential(2)}</dd>
        </div>
        <div>
          <dt>Phase step</dt>
          <dd>{diagnostics.recommendedDt.toFixed(4)}</dd>
        </div>
        <div>
          <dt>Interpretation</dt>
          <dd>Probability on the unwrapped periodic domain</dd>
        </div>
      </dl>
    </section>
  );
}
