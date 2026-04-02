interface SharePanelProps {
  readonly onCopyShareLink: () => void;
  readonly copyStatus: 'idle' | 'copied' | 'failed';
  readonly embedded: boolean;
}

export function SharePanel({
  onCopyShareLink,
  copyStatus,
  embedded,
}: SharePanelProps): React.JSX.Element {
  return (
    <section className="content-panel share-panel">
      <div className="panel-header">
        <div>
          <h2>Share Scene</h2>
          <p>
            Copy a reproducible link for the current mode, geometry, controls, and display settings.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={onCopyShareLink}
        >
          Copy share link
        </button>
      </div>
      <p className="share-note">
        {embedded
          ? 'Links copied from embedded mode open the full app by default, so the destination keeps the full surrounding help and controls.'
          : 'Shared links restore the current scene state from the URL. Transient diagnostics, renderer timings, and loading state are intentionally omitted.'}
      </p>
      <p
        aria-live="polite"
        className="share-status"
        role="status"
      >
        {copyStatus === 'copied'
          ? 'Share link copied.'
          : copyStatus === 'failed'
            ? 'Clipboard copy failed.'
            : 'Ready to copy the current scene.'}
      </p>
    </section>
  );
}
