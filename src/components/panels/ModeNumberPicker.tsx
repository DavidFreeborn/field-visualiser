interface ModeNumberPickerProps {
  readonly label: string;
  readonly options: readonly number[];
  readonly selected: readonly number[];
  readonly onChange: (modeNumbers: readonly number[]) => void;
}

/**
 * Checkbox row for choosing which mode numbers enter a standing/normal-mode
 * superposition. At least one mode always stays selected, so the engine never
 * receives an empty list.
 */
export function ModeNumberPicker({
  label,
  options,
  selected,
  onChange,
}: ModeNumberPickerProps): React.JSX.Element {
  const toggle = (modeNumber: number): void => {
    if (selected.includes(modeNumber)) {
      if (selected.length > 1) {
        onChange(selected.filter((entry) => entry !== modeNumber));
      }
      return;
    }

    onChange([...selected, modeNumber].sort((a, b) => a - b));
  };

  return (
    <div className="mode-picker">
      <span>{label}</span>
      <div aria-label={label} className="mode-picker-row" role="group">
        {options.map((modeNumber) => (
          <label className="mode-picker-option" key={modeNumber}>
            <input
              checked={selected.includes(modeNumber)}
              type="checkbox"
              onChange={() => toggle(modeNumber)}
            />
            <span>{modeNumber}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
