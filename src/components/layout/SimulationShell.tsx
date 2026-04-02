interface SimulationShellProps {
  readonly children: React.ReactNode;
}

export function SimulationShell({ children }: SimulationShellProps): React.JSX.Element {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Field Visualiser</p>
        <h1>Periodic lattice visualisation with classical and one-particle views.</h1>
        <p className="lead">
          The current scope is still deliberately narrow: 1D periodic only,
          with a conservative classical chain and a free-field one-particle
          quantum pedagogical mode built on the same lattice.
        </p>
      </section>

      <div className="prototype-grid">{children}</div>

      <section
        aria-labelledby="architecture-title"
        className="content-panel architecture-grid"
      >
        <div className="panel-header">
          <h2 id="architecture-title">Module boundaries</h2>
          <p>
            Physics remains deterministic and DOM-free; rendering remains
            display-only; React coordinates presets, controls, and diagnostics.
          </p>
        </div>
        <article>
          <h3>physics-core</h3>
          <p>Pure TypeScript simulation engines, operators, invariants, and typed configuration.</p>
        </article>
        <article>
          <h3>render-core</h3>
          <p>Read-only visual transforms and Pixi-facing drawing adapters.</p>
        </article>
        <article>
          <h3>ui-app</h3>
          <p>Controls, presets, help panels, diagnostics, and serialisable scene state.</p>
        </article>
      </section>

      <section className="content-panel caveat-panel">
        <div className="panel-header">
          <h2>Scientific scope</h2>
          <p>
            Current implementation: periodic 1D classical and periodic 1D
            free-field one-particle only. Fixed boundaries and 2D systems remain
            out of scope for this phase.
          </p>
        </div>
        <p className="lead compact">
          This prototype does not attempt interacting quantum field theory and
          does not fabricate effects for visual appeal. The quantum mode evolves
          a one-particle amplitude in the periodic lattice Hilbert space and
          displays probability density, not a literal classical particle blob.
        </p>
      </section>
    </main>
  );
}
