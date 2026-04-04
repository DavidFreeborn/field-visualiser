interface SimulationShellProps {
  readonly children: React.ReactNode;
  readonly embedded?: boolean;
}

export function SimulationShell({
  children,
  embedded = false,
}: SimulationShellProps): React.JSX.Element {
  return (
    <main className={`app-shell${embedded ? ' app-shell-embedded' : ''}`}>
      {embedded ? null : (
        <section className="hero-panel">
          <h1>Visualising Free Fields</h1>
        </section>
      )}

      <div className="prototype-grid">{children}</div>
    </main>
  );
}
