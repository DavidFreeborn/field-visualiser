interface PresetOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

interface PresetPanelProps {
  readonly presets: readonly PresetOption[];
  readonly onPresetSelect: (presetId: string) => void;
  readonly onRestoreRecommended: () => void;
}

export function PresetPanel({
  presets,
  onPresetSelect,
  onRestoreRecommended,
}: PresetPanelProps): React.JSX.Element {
  return (
    <section className="content-panel preset-panel">
      <div className="panel-header">
        <div>
          <h2>Preset Scenes</h2>
          <p>Curated starting points for reflections, wraparound, standing modes, and one-particle localization.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={onRestoreRecommended}
        >
          Restore recommended preset
        </button>
      </div>
      <div className="preset-grid">
        {presets.map((preset) => (
          <button
            key={preset.id}
            className="preset-card"
            type="button"
            onClick={() => onPresetSelect(preset.id)}
          >
            <strong>{preset.label}</strong>
            <span>{preset.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
