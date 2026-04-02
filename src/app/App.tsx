import { useState } from 'react';
import { PrototypeCanvas } from '../components/layout/PrototypeCanvas';
import { SimulationShell } from '../components/layout/SimulationShell';
import { Classical2DControls } from '../components/panels/Classical2DControls';
import { DiagnosticsPanel } from '../components/panels/DiagnosticsPanel';
import { type AppMode } from '../components/panels/ModeSwitch';
import { type Geometry, type Geometry1D, type Geometry2D } from '../components/panels/GeometrySwitch';
import { PrototypeControls } from '../components/panels/PrototypeControls';
import { QuantumDiagnosticsPanel } from '../components/panels/QuantumDiagnosticsPanel';
import { QuantumPrototypeControls } from '../components/panels/QuantumPrototypeControls';
import { useClassical2DPrototype } from './state/useClassical2DPrototype';
import { usePeriodicClassicalPrototype } from './state/usePeriodicClassicalPrototype';
import { usePeriodicQuantumPrototype } from './state/usePeriodicQuantumPrototype';
import { useFixedClassicalPrototype } from './state/useFixedClassicalPrototype';
import { useFixedQuantumPrototype } from './state/useFixedQuantumPrototype';

export function App(): React.JSX.Element {
  const [mode, setMode] = useState<AppMode>('classical');
  const [geometry, setGeometry] = useState<Geometry>('periodic-circle');
  const classicalController = usePeriodicClassicalPrototype(mode === 'classical');
  const quantumController = usePeriodicQuantumPrototype(mode === 'quantum-one-particle');
  const fixedClassicalController = useFixedClassicalPrototype(
    mode === 'classical' && geometry === 'fixed-interval',
  );
  const fixedQuantumController = useFixedQuantumPrototype(
    mode === 'quantum-one-particle' && geometry === 'fixed-interval',
  );
  const square2DController = useClassical2DPrototype(
    'square-fixed',
    mode === 'classical' && geometry === 'square-fixed',
  );
  const torus2DController = useClassical2DPrototype(
    'torus-periodic',
    mode === 'classical' && geometry === 'torus-periodic',
  );

  const handleModeChange = (nextMode: AppMode): void => {
    if (nextMode === 'quantum-one-particle' && isGeometry2D(geometry)) {
      setGeometry('periodic-circle');
    }
    setMode(nextMode);
  };

  const handleGeometryChange = (nextGeometry: Geometry): void => {
    if (mode === 'quantum-one-particle' && isGeometry2D(nextGeometry)) {
      return;
    }
    setGeometry(nextGeometry);
  };

  const activeController =
    mode === 'classical'
      ? geometry === 'periodic-circle'
        ? classicalController
        : geometry === 'fixed-interval'
          ? fixedClassicalController
          : geometry === 'square-fixed'
            ? square2DController
            : torus2DController
      : geometry === 'periodic-circle'
        ? quantumController
        : fixedQuantumController;
  const classical1DBranch =
    geometry === 'fixed-interval' ? fixedClassicalController : classicalController;
  const classical2DBranch =
    geometry === 'torus-periodic' ? torus2DController : square2DController;
  const quantumBranch = geometry === 'periodic-circle' ? quantumController : fixedQuantumController;
  const resolutionLabel =
    isGeometry2D(geometry)
      ? `${classical2DBranch.snapshot.width} × ${classical2DBranch.snapshot.height} lattice`
      : `${classical1DBranch.snapshot.siteCount} sites`;

  return (
    <SimulationShell>
      {mode === 'classical' && isGeometry2D(geometry) ? (
        <Classical2DControls
          config={classical2DBranch.config}
          geometry={geometry}
          mode={mode}
          playing={classical2DBranch.playing}
          quantity={classical2DBranch.quantity}
          showLattice={classical2DBranch.showLattice}
          speed={classical2DBranch.speed}
          onConfigChange={classical2DBranch.setConfig}
          onGeometryChange={(next) => handleGeometryChange(next)}
          onModeChange={handleModeChange}
          onPlayingChange={classical2DBranch.setPlaying}
          onQuantityChange={classical2DBranch.setQuantity}
          onReset={classical2DBranch.reset}
          onShowLatticeChange={classical2DBranch.setShowLattice}
          onSpeedChange={classical2DBranch.setSpeed}
          onStep={classical2DBranch.stepOnce}
        />
      ) : mode === 'classical' ? (
        <PrototypeControls
          config={classical1DBranch.config}
          geometry={geometry as Geometry1D}
          mode={mode}
          playing={classical1DBranch.playing}
          quantity={classical1DBranch.quantity}
          showLattice={classical1DBranch.showLattice}
          showSprings={classical1DBranch.showSprings}
          speed={classical1DBranch.speed}
          onConfigChange={classical1DBranch.setConfig}
          onModeChange={handleModeChange}
          onGeometryChange={(next) => handleGeometryChange(next)}
          onPlayingChange={classical1DBranch.setPlaying}
          onQuantityChange={classical1DBranch.setQuantity}
          onReset={classical1DBranch.reset}
          onShowLatticeChange={classical1DBranch.setShowLattice}
          onShowSpringsChange={classical1DBranch.setShowSprings}
          onSpeedChange={classical1DBranch.setSpeed}
          onStep={classical1DBranch.stepOnce}
        />
      ) : (
        <QuantumPrototypeControls
          config={quantumBranch.config}
          geometry={geometry as Geometry1D}
          mode={mode}
          playing={quantumBranch.playing}
          quantity={quantumBranch.quantity}
          showLattice={quantumBranch.showLattice}
          speed={quantumBranch.speed}
          onConfigChange={quantumBranch.setConfig}
          onModeChange={handleModeChange}
          onGeometryChange={(next) => handleGeometryChange(next)}
          onPlayingChange={quantumBranch.setPlaying}
          onQuantityChange={quantumBranch.setQuantity}
          onReset={quantumBranch.reset}
          onShowLatticeChange={quantumBranch.setShowLattice}
          onSpeedChange={quantumBranch.setSpeed}
          onStep={quantumBranch.stepOnce}
        />
      )}
      <PrototypeCanvas
        quantity={activeController.quantity}
        showLattice={activeController.showLattice}
        showSprings={
          mode === 'classical'
            ? geometry === 'periodic-circle'
              ? classicalController.showSprings
              : geometry === 'fixed-interval'
                ? fixedClassicalController.showSprings
                : false
            : false
        }
        snapshot={activeController.snapshot}
      />
      {mode === 'classical' ? (
        <DiagnosticsPanel
          boundaryLabel={
            isGeometry2D(geometry)
              ? classical2DBranch.snapshot.boundaryCondition
              : classical1DBranch.snapshot.boundaryCondition
          }
          diagnostics={isGeometry2D(geometry) ? classical2DBranch.diagnostics : classical1DBranch.diagnostics}
          quantityLabel={isGeometry2D(geometry) ? classical2DBranch.quantity : classical1DBranch.quantity}
          resolutionLabel={resolutionLabel}
          systemLabel={
            isGeometry2D(geometry)
              ? classical2DBranch.snapshot.systemLabel
              : classical1DBranch.snapshot.systemLabel
          }
          time={isGeometry2D(geometry) ? classical2DBranch.snapshot.time : classical1DBranch.snapshot.time}
        />
      ) : (
        <QuantumDiagnosticsPanel
          boundaryLabel={quantumBranch.snapshot.boundaryCondition}
          diagnostics={quantumBranch.diagnostics}
          quantityLabel={quantumBranch.quantity}
          siteCount={quantumBranch.snapshot.siteCount}
          systemLabel={quantumBranch.snapshot.systemLabel}
          time={quantumBranch.snapshot.time}
        />
      )}
    </SimulationShell>
  );
}

function isGeometry2D(geometry: Geometry): geometry is Geometry2D {
  return geometry === 'square-fixed' || geometry === 'torus-periodic';
}
