import type { AppMode } from './ModeSwitch';

export type Geometry1D = 'periodic-circle' | 'periodic-circle-fixed' | 'fixed-interval';
export type Geometry2D = 'square-fixed' | 'torus-periodic';
export type Geometry = Geometry1D | Geometry2D;

interface GeometrySwitchProps {
  readonly geometry: Geometry;
  readonly mode: AppMode;
  readonly onGeometryChange: (geometry: Geometry) => void;
}

export function GeometrySwitch({
  geometry,
  mode,
  onGeometryChange,
}: GeometrySwitchProps): React.JSX.Element {
  void mode;

  return (
    <label>
      <span>Geometry</span>
      <select
        value={geometry}
        onChange={(event) => onGeometryChange(event.target.value as Geometry)}
      >
        <option value="periodic-circle">Periodic circle, deforming</option>
        <option value="periodic-circle-fixed">Periodic circle, fixed ring</option>
        <option value="fixed-interval">Fixed-end interval</option>
        <option value="square-fixed">2D square, fixed edges</option>
        <option value="torus-periodic">2D torus, periodic</option>
      </select>
    </label>
  );
}
