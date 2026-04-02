import { PrototypeCanvas } from '../components/layout/PrototypeCanvas';
import { SimulationShell } from '../components/layout/SimulationShell';
import { DiagnosticsPanel } from '../components/panels/DiagnosticsPanel';
import { PrototypeControls } from '../components/panels/PrototypeControls';
import { usePeriodicClassicalPrototype } from './state/usePeriodicClassicalPrototype';

export function App(): React.JSX.Element {
  const controller = usePeriodicClassicalPrototype();

  return (
    <SimulationShell>
      <PrototypeControls
        config={controller.config}
        playing={controller.playing}
        quantity={controller.quantity}
        showLattice={controller.showLattice}
        showSprings={controller.showSprings}
        speed={controller.speed}
        onConfigChange={controller.setConfig}
        onPlayingChange={controller.setPlaying}
        onQuantityChange={controller.setQuantity}
        onReset={controller.reset}
        onShowLatticeChange={controller.setShowLattice}
        onShowSpringsChange={controller.setShowSprings}
        onSpeedChange={controller.setSpeed}
        onStep={controller.stepOnce}
      />
      <PrototypeCanvas
        quantity={controller.quantity}
        showLattice={controller.showLattice}
        showSprings={controller.showSprings}
        snapshot={controller.snapshot}
      />
      <DiagnosticsPanel
        diagnostics={controller.diagnostics}
        quantityLabel={controller.quantity}
        siteCount={controller.snapshot.siteCount}
        time={controller.snapshot.time}
      />
    </SimulationShell>
  );
}
