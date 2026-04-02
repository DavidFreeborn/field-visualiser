export function AboutPanel(): React.JSX.Element {
  return (
    <section className="content-panel">
      <div className="panel-header">
        <div>
          <h2>About</h2>
          <p>Scope, interpretation, and limitations for the current release.</p>
        </div>
      </div>
      <div className="visual-meta-grid">
        <article className="visual-meta-card">
          <h3>Quantum scope</h3>
          <p>Free-field one-particle visualisation is pedagogical. It is not interacting QFT.</p>
        </article>
        <article className="visual-meta-card">
          <h3>Red regions</h3>
          <p>In quantum mode, red regions indicate probability density, not little particles.</p>
        </article>
        <article className="visual-meta-card">
          <h3>Continuum claims</h3>
          <p>Continuum-like behaviour is approximated by refining the lattice; finite grids remain discrete models.</p>
        </article>
        <article className="visual-meta-card">
          <h3>Classical vs quantum</h3>
          <p>Classical views show field quantities such as displacement and energy density; quantum views show one-particle amplitudes or |psi|^2.</p>
        </article>
      </div>
    </section>
  );
}
