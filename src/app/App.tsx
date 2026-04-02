import { useState } from 'react';
import { PrototypeCanvas } from '../components/layout/PrototypeCanvas';
import { SimulationShell } from '../components/layout/SimulationShell';
import { DiagnosticsPanel } from '../components/panels/DiagnosticsPanel';
import { type AppMode } from '../components/panels/ModeSwitch';
import { PrototypeControls } from '../components/panels/PrototypeControls';
import { QuantumDiagnosticsPanel } from '../components/panels/QuantumDiagnosticsPanel';
import { QuantumPrototypeControls } from '../components/panels/QuantumPrototypeControls';
import { usePeriodicClassicalPrototype } from './state/usePeriodicClassicalPrototype';
import { usePeriodicQuantumPrototype } from './state/usePeriodicQuantumPrototype';

export function App(): React.JSX.Element {
  const [mode, setMode] = useState<AppMode>('classical');
  const classicalController = usePeriodicClassicalPrototype(mode === 'classical');
  const quantumController = usePeriodicQuantumPrototype(mode === 'quantum-one-particle');

  const activeController =
    mode === 'classical' ? classicalController : quantumController;

  return (
    <SimulationShell>
      {mode === 'classical' ? (
        <PrototypeControls
          config={classicalController.config}
          mode={mode}
          playing={classicalController.playing}
          quantity={classicalController.quantity}
          showLattice={classicalController.showLattice}
          showSprings={classicalController.showSprings}
          speed={classicalController.speed}
          onConfigChange={classicalController.setConfig}
          onModeChange={setMode}
          onPlayingChange={classicalController.setPlaying}
          onQuantityChange={classicalController.setQuantity}
          onReset={classicalController.reset}
          onShowLatticeChange={classicalController.setShowLattice}
          onShowSpringsChange={classicalController.setShowSprings}
          onSpeedChange={classicalController.setSpeed}
          onStep={classicalController.stepOnce}
        />
      ) : (
        <QuantumPrototypeControls
          config={quantumController.config}
          mode={mode}
          playing={quantumController.playing}
          quantity={quantumController.quantity}
          showLattice={quantumController.showLattice}
          speed={quantumController.speed}
          onConfigChange={quantumController.setConfig}
          onModeChange={setMode}
          onPlayingChange={quantumController.setPlaying}
          onQuantityChange={quantumController.setQuantity}
          onReset={quantumController.reset}
          onShowLatticeChange={quantumController.setShowLattice}
          onSpeedChange={quantumController.setSpeed}
          onStep={quantumController.stepOnce}
        />
      )}
      <PrototypeCanvas
        quantity={activeController.quantity}
        showLattice={activeController.showLattice}
        showSprings={mode === 'classical' ? classicalController.showSprings : false}
        snapshot={activeController.snapshot}
      />
      {mode === 'classical' ? (
        <DiagnosticsPanel
          diagnostics={classicalController.diagnostics}
          quantityLabel={classicalController.quantity}
          siteCount={classicalController.snapshot.siteCount}
          time={classicalController.snapshot.time}
        />
      ) : (
        <QuantumDiagnosticsPanel
          diagnostics={quantumController.diagnostics}
          quantityLabel={quantumController.quantity}
          siteCount={quantumController.snapshot.siteCount}
          time={quantumController.snapshot.time}
        />
      )}
    </SimulationShell>
  );
}
