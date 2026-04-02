export type Geometry1D = 'periodic-circle' | 'fixed-interval';

interface GeometrySwitchProps {
  readonly geometry: Geometry1D;
  readonly onGeometryChange: (geometry: Geometry1D) => void;
}

export function GeometrySwitch({
  geometry,
  onGeometryChange,
}: GeometrySwitchProps): React.JSX.Element {
  return (
    <label>
      <span>Geometry</span>
      <select
        value={geometry}
        onChange={(event) => onGeometryChange(event.target.value as Geometry1D)}
      >
        <option value="periodic-circle">Periodic circle</option>
        <option value="fixed-interval">Fixed-end interval</option>
      </select>
    </label>
  );
}
