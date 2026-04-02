import { useState } from 'react';
import { PrototypeCanvas } from '../components/layout/PrototypeCanvas';
import { SimulationShell } from '../components/layout/SimulationShell';
import { DiagnosticsPanel } from '../components/panels/DiagnosticsPanel';
import { type AppMode } from '../components/panels/ModeSwitch';
import { type Geometry1D } from '../components/panels/GeometrySwitch';
import { PrototypeControls } from '../components/panels/PrototypeControls';
import { QuantumDiagnosticsPanel } from '../components/panels/QuantumDiagnosticsPanel';
import { QuantumPrototypeControls } from '../components/panels/QuantumPrototypeControls';
import { usePeriodicClassicalPrototype } from './state/usePeriodicClassicalPrototype';
import { usePeriodicQuantumPrototype } from './state/usePeriodicQuantumPrototype';
import { useFixedClassicalPrototype } from './state/useFixedClassicalPrototype';
import { useFixedQuantumPrototype } from './state/useFixedQuantumPrototype';

export function App(): React.JSX.Element {
  const [mode, setMode] = useState<AppMode>('classical');
  const [geometry, setGeometry] = useState<Geometry1D>('periodic-circle');
  const classicalController = usePeriodicClassicalPrototype(mode === 'classical');
  const quantumController = usePeriodicQuantumPrototype(mode === 'quantum-one-particle');
  const fixedClassicalController = useFixedClassicalPrototype(
    mode === 'classical' && geometry === 'fixed-interval',
  );
  const fixedQuantumController = useFixedQuantumPrototype(
    mode === 'quantum-one-particle' && geometry === 'fixed-interval',
  );

  const activeController =
    mode === 'classical'
      ? geometry === 'periodic-circle'
        ? classicalController
        : fixedClassicalController
      : geometry === 'periodic-circle'
        ? quantumController
        : fixedQuantumController;
  const classicalBranch =
    geometry === 'periodic-circle' ? classicalController : fixedClassicalController;
  const quantumBranch = geometry === 'periodic-circle' ? quantumController : fixedQuantumController;

  return (
    <SimulationShell>
      {mode === 'classical' ? (
        <PrototypeControls
          config={classicalBranch.config}
          geometry={geometry}
          mode={mode}
          playing={classicalBranch.playing}
          quantity={classicalBranch.quantity}
          showLattice={classicalBranch.showLattice}
          showSprings={classicalBranch.showSprings}
          speed={classicalBranch.speed}
          onConfigChange={classicalBranch.setConfig}
          onModeChange={setMode}
          onGeometryChange={setGeometry}
          onPlayingChange={classicalBranch.setPlaying}
          onQuantityChange={classicalBranch.setQuantity}
          onReset={classicalBranch.reset}
          onShowLatticeChange={classicalBranch.setShowLattice}
          onShowSpringsChange={classicalBranch.setShowSprings}
          onSpeedChange={classicalBranch.setSpeed}
          onStep={classicalBranch.stepOnce}
        />
      ) : (
        <QuantumPrototypeControls
          config={quantumBranch.config}
          geometry={geometry}
          mode={mode}
          playing={quantumBranch.playing}
          quantity={quantumBranch.quantity}
          showLattice={quantumBranch.showLattice}
          speed={quantumBranch.speed}
          onConfigChange={quantumBranch.setConfig}
          onModeChange={setMode}
          onGeometryChange={setGeometry}
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
              : fixedClassicalController.showSprings
            : false
        }
        snapshot={activeController.snapshot}
      />
      {mode === 'classical' ? (
        <DiagnosticsPanel
          boundaryLabel={classicalBranch.snapshot.boundaryCondition}
          diagnostics={classicalBranch.diagnostics}
          quantityLabel={classicalBranch.quantity}
          siteCount={classicalBranch.snapshot.siteCount}
          systemLabel={classicalBranch.snapshot.systemLabel}
          time={classicalBranch.snapshot.time}
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
