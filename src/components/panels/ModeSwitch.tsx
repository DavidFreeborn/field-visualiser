export type AppMode = 'classical' | 'quantum-one-particle';

interface ModeSwitchProps {
  readonly mode: AppMode;
  readonly onModeChange: (mode: AppMode) => void;
}

export function ModeSwitch({
  mode,
  onModeChange,
}: ModeSwitchProps): React.JSX.Element {
  return (
    <label>
      <span>Field type</span>
      <select
        value={mode}
        onChange={(event) => onModeChange(event.target.value as AppMode)}
      >
        <option value="classical">Classical field</option>
        <option value="quantum-one-particle">Quantum field</option>
      </select>
    </label>
  );
}
