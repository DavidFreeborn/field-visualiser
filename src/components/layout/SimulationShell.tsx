interface SimulationShellProps {
  readonly children: React.ReactNode;
}

export function SimulationShell({ children }: SimulationShellProps): React.JSX.Element {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Field Visualiser</p>
        <h1>Periodic classical field prototype, built on a strict scientific core.</h1>
        <p className="lead">
          This first end-to-end implementation models a 1D periodic chain of
          nearest-neighbour oscillators with conservative symplectic time
          stepping. It is intentionally limited to the classical periodic case
          before interval, 2D, or quantum extensions.
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
            Current implementation: classical periodic 1D only. Free-field
            one-particle quantum views and additional geometries follow in later
            phases.
          </p>
        </div>
        <p className="lead compact">
          This prototype does not attempt interacting quantum field theory and
          does not fabricate effects for visual appeal. The displayed dynamics
          come directly from the discrete lattice equation of motion. Current
          milestone: project setup plus the validated 1D periodic classical
          prototype only.
        </p>
      </section>
    </main>
  );
}
