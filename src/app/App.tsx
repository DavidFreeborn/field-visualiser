import { useEffect, useMemo, useRef, useState } from 'react';
import { PrototypeCanvas } from '../components/layout/PrototypeCanvas';
import { SimulationShell } from '../components/layout/SimulationShell';
import { Classical2DControls } from '../components/panels/Classical2DControls';
import { type AppMode } from '../components/panels/ModeSwitch';
import {
  type Geometry,
  type Geometry1D,
  type Geometry2D,
} from '../components/panels/GeometrySwitch';
import { PrototypeControls } from '../components/panels/PrototypeControls';
import { Quantum2DControls } from '../components/panels/Quantum2DControls';
import { QuantumPrototypeControls } from '../components/panels/QuantumPrototypeControls';
import { defaultClassical1DFixedConfig } from './presets/classical1dFixed';
import { defaultClassical1DPeriodicConfig } from './presets/classical1dPeriodic';
import { defaultClassical2DSquareConfig } from './presets/classical2dSquare';
import { defaultClassical2DTorusConfig } from './presets/classical2dTorus';
import { defaultQuantum1DFixedConfig } from './presets/quantum1dFixed';
import { defaultQuantum1DPeriodicConfig } from './presets/quantum1dPeriodic';
import { defaultQuantum2DSquareConfig } from './presets/quantum2dSquare';
import { defaultQuantum2DTorusConfig } from './presets/quantum2dTorus';
import { useClassical2DPrototype } from './state/useClassical2DPrototype';
import { useQuantum2DPrototype } from './state/useQuantum2DPrototype';
import { usePeriodicClassicalPrototype } from './state/usePeriodicClassicalPrototype';
import { usePeriodicQuantumPrototype } from './state/usePeriodicQuantumPrototype';
import { useFixedClassicalPrototype } from './state/useFixedClassicalPrototype';
import { useFixedQuantumPrototype } from './state/useFixedQuantumPrototype';
import {
  buildSceneSearch,
  parseSceneState,
  type SceneStateV1,
} from './state/sceneState';

interface AppProps {
  readonly embedded?: boolean;
}

export function App({ embedded = false }: AppProps): React.JSX.Element {
  const initialSceneRef = useRef<SceneStateV1 | null>(
    typeof window === 'undefined'
      ? null
      : parseSceneState(window.location.search),
  );
  const [mode, setMode] = useState<AppMode>(
    initialSceneRef.current?.mode ?? 'classical',
  );
  const [geometry, setGeometry] = useState<Geometry>(
    initialSceneRef.current?.geometry ?? 'periodic-circle',
  );
  const [oneDView, setOneDView] = useState<'plot' | 'ring'>(
    // The circle is the primary representation of periodic 1D topology.
    initialSceneRef.current?.view1d ?? 'ring',
  );
  const classicalController = usePeriodicClassicalPrototype(
    mode === 'classical',
  );
  const quantumController = usePeriodicQuantumPrototype(
    mode === 'quantum-one-particle',
  );
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
  const square2DQuantumController = useQuantum2DPrototype(
    'square-fixed',
    mode === 'quantum-one-particle' && geometry === 'square-fixed',
  );
  const torus2DQuantumController = useQuantum2DPrototype(
    'torus-periodic',
    mode === 'quantum-one-particle' && geometry === 'torus-periodic',
  );

  const controllerFor = (
    forMode: AppMode,
    forGeometry: Geometry,
  ):
    | typeof classicalController
    | typeof fixedClassicalController
    | typeof square2DController
    | typeof quantumController
    | typeof fixedQuantumController
    | typeof square2DQuantumController => {
    if (forMode === 'classical') {
      return isPeriodicCircleGeometry(forGeometry)
        ? classicalController
        : forGeometry === 'fixed-interval'
          ? fixedClassicalController
          : forGeometry === 'square-fixed'
            ? square2DController
            : torus2DController;
    }

    return isPeriodicCircleGeometry(forGeometry)
      ? quantumController
      : forGeometry === 'fixed-interval'
        ? fixedQuantumController
        : forGeometry === 'square-fixed'
          ? square2DQuantumController
          : torus2DQuantumController;
  };

  // The two periodic circle geometries are two visual representations of the
  // same physical periodic 1D system (and share a controller), so switching
  // between them may preserve the physical state. Every other mode/geometry
  // switch targets a physically different model and must start at time zero.
  const physicalModelKey = (forMode: AppMode, forGeometry: Geometry): string =>
    `${forMode}:${isPeriodicCircleGeometry(forGeometry) ? 'periodic-circle' : forGeometry}`;

  const handleModeChange = (nextMode: AppMode): void => {
    if (
      physicalModelKey(nextMode, geometry) !== physicalModelKey(mode, geometry)
    ) {
      // Reset synchronously so the destination publishes a fresh time-zero
      // frame before the canvas re-subscribes - no stale frame can flash.
      controllerFor(nextMode, geometry).reset();
    }

    setMode(nextMode);
  };

  const handleGeometryChange = (nextGeometry: Geometry): void => {
    // Carry the displayed quantity across geometry changes whenever the
    // destination supports it (e.g. classical energy density survives moving
    // from the ring to the 2D torus).
    const currentQuantity = activeController.quantity;

    if (
      physicalModelKey(mode, nextGeometry) !== physicalModelKey(mode, geometry)
    ) {
      controllerFor(mode, nextGeometry).reset();
    }

    setGeometry(nextGeometry);

    if (mode === 'classical') {
      const destination = isGeometry2D(nextGeometry)
        ? nextGeometry === 'torus-periodic'
          ? torus2DController
          : square2DController
        : nextGeometry === 'fixed-interval'
          ? fixedClassicalController
          : classicalController;
      if (
        currentQuantity === 'displacement' ||
        currentQuantity === 'velocity' ||
        currentQuantity === 'energy-density'
      ) {
        destination.setQuantity(currentQuantity);
      }
      return;
    }

    if (isGeometry2D(nextGeometry)) {
      const destination =
        nextGeometry === 'torus-periodic'
          ? torus2DQuantumController
          : square2DQuantumController;
      if (
        currentQuantity === 'probability-density' ||
        currentQuantity === 'magnitude' ||
        currentQuantity === 'real-part' ||
        currentQuantity === 'imaginary-part' ||
        currentQuantity === 'phase-magnitude'
      ) {
        destination.setQuantity(currentQuantity);
      }
      return;
    }

    const destination =
      nextGeometry === 'fixed-interval'
        ? fixedQuantumController
        : quantumController;
    if (
      currentQuantity === 'probability-density' ||
      currentQuantity === 'magnitude' ||
      currentQuantity === 'real-part' ||
      currentQuantity === 'imaginary-part' ||
      currentQuantity === 'phase-magnitude' ||
      currentQuantity === 'real-imaginary-parts'
    ) {
      destination.setQuantity(currentQuantity);
    }
  };

  const activeController =
    mode === 'classical'
      ? isPeriodicCircleGeometry(geometry)
        ? classicalController
        : geometry === 'fixed-interval'
          ? fixedClassicalController
          : geometry === 'square-fixed'
            ? square2DController
            : torus2DController
      : isPeriodicCircleGeometry(geometry)
        ? quantumController
        : geometry === 'fixed-interval'
          ? fixedQuantumController
          : geometry === 'square-fixed'
            ? square2DQuantumController
            : torus2DQuantumController;
  const classical1DBranch =
    geometry === 'fixed-interval'
      ? fixedClassicalController
      : classicalController;
  const classical2DBranch =
    geometry === 'torus-periodic' ? torus2DController : square2DController;
  const quantum1DBranch =
    geometry === 'fixed-interval' ? fixedQuantumController : quantumController;
  const quantum2DBranch =
    geometry === 'torus-periodic'
      ? torus2DQuantumController
      : square2DQuantumController;
  const restoreCompleteRef = useRef(false);
  const restoreControllersRef = useRef<
    Parameters<typeof applySceneState>[1] | null
  >(null);

  restoreControllersRef.current = {
    setMode,
    setGeometry,
    classicalController,
    fixedClassicalController,
    square2DController,
    torus2DController,
    quantumController,
    fixedQuantumController,
    square2DQuantumController,
    torus2DQuantumController,
  };

  useEffect(() => {
    if (restoreCompleteRef.current) {
      return;
    }

    const initialScene = initialSceneRef.current;

    if (initialScene !== null && restoreControllersRef.current !== null) {
      applySceneState(initialScene, restoreControllersRef.current);
    } else if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      restoreControllersRef.current !== null
    ) {
      // Respect reduced-motion: start paused unless a shared scene explicitly
      // requests playback.
      const controllers = restoreControllersRef.current;
      controllers.classicalController.setPlaying(false);
      controllers.fixedClassicalController.setPlaying(false);
      controllers.square2DController.setPlaying(false);
      controllers.torus2DController.setPlaying(false);
      controllers.quantumController.setPlaying(false);
      controllers.fixedQuantumController.setPlaying(false);
      controllers.square2DQuantumController.setPlaying(false);
      controllers.torus2DQuantumController.setPlaying(false);
    }

    restoreCompleteRef.current = true;
  }, []);

  const activeSceneState = useMemo<SceneStateV1>(() => {
    const baseScene = ((): SceneStateV1 => {
      switch (`${mode}:${geometry}`) {
        case 'classical:periodic-circle':
          return {
            v: 1,
            mode,
            geometry,
            quantity: classicalController.quantity,
            circleLayout: classicalController.circleLayout,
            playing: classicalController.playing,
            speed: classicalController.speed,
            showLattice: classicalController.showLattice,
            showSprings: classicalController.showSprings,
            config: classicalController.config,
          };
        case 'classical:periodic-circle-fixed':
          return {
            v: 1,
            mode,
            geometry,
            quantity: classicalController.quantity,
            playing: classicalController.playing,
            speed: classicalController.speed,
            showLattice: classicalController.showLattice,
            showSprings: classicalController.showSprings,
            config: classicalController.config,
          };
        case 'classical:fixed-interval':
          return {
            v: 1,
            mode,
            geometry,
            quantity: fixedClassicalController.quantity,
            playing: fixedClassicalController.playing,
            speed: fixedClassicalController.speed,
            showLattice: fixedClassicalController.showLattice,
            showSprings: fixedClassicalController.showSprings,
            config: fixedClassicalController.config,
          };
        case 'classical:square-fixed':
          return {
            v: 1,
            mode,
            geometry,
            quantity: square2DController.quantity,
            playing: square2DController.playing,
            speed: square2DController.speed,
            showLattice: square2DController.showLattice,
            showSprings: false,
            config: square2DController.config,
          };
        case 'classical:torus-periodic':
          return {
            v: 1,
            mode,
            geometry,
            quantity: torus2DController.quantity,
            playing: torus2DController.playing,
            speed: torus2DController.speed,
            showLattice: torus2DController.showLattice,
            showSprings: false,
            config: torus2DController.config,
          };
        case 'quantum-one-particle:periodic-circle':
          return {
            v: 1,
            mode,
            geometry,
            quantity: quantumController.quantity,
            playing: quantumController.playing,
            speed: quantumController.speed,
            showLattice: quantumController.showLattice,
            showSprings: false,
            config: quantumController.config,
          };
        case 'quantum-one-particle:periodic-circle-fixed':
          return {
            v: 1,
            mode,
            geometry,
            quantity: quantumController.quantity,
            playing: quantumController.playing,
            speed: quantumController.speed,
            showLattice: quantumController.showLattice,
            showSprings: false,
            config: quantumController.config,
          };
        case 'quantum-one-particle:fixed-interval':
          return {
            v: 1,
            mode,
            geometry,
            quantity: fixedQuantumController.quantity,
            playing: fixedQuantumController.playing,
            speed: fixedQuantumController.speed,
            showLattice: fixedQuantumController.showLattice,
            showSprings: false,
            config: fixedQuantumController.config,
          };
        case 'quantum-one-particle:square-fixed':
          return {
            v: 1,
            mode,
            geometry,
            quantity: square2DQuantumController.quantity,
            playing: square2DQuantumController.playing,
            speed: square2DQuantumController.speed,
            showLattice: square2DQuantumController.showLattice,
            showSprings: false,
            config: square2DQuantumController.config,
          };
        case 'quantum-one-particle:torus-periodic':
        default:
          return {
            v: 1,
            mode,
            geometry,
            quantity: torus2DQuantumController.quantity,
            playing: torus2DQuantumController.playing,
            speed: torus2DQuantumController.speed,
            showLattice: torus2DQuantumController.showLattice,
            showSprings: false,
            config: torus2DQuantumController.config,
          };
      }
    })();

    return { ...baseScene, view1d: oneDView };
  }, [
    mode,
    geometry,
    oneDView,
    classicalController.circleLayout,
    classicalController.config,
    classicalController.playing,
    classicalController.quantity,
    classicalController.showLattice,
    classicalController.showSprings,
    classicalController.speed,
    fixedClassicalController.config,
    fixedClassicalController.playing,
    fixedClassicalController.quantity,
    fixedClassicalController.showLattice,
    fixedClassicalController.showSprings,
    fixedClassicalController.speed,
    square2DController.config,
    square2DController.playing,
    square2DController.quantity,
    square2DController.showLattice,
    square2DController.speed,
    torus2DController.config,
    torus2DController.playing,
    torus2DController.quantity,
    torus2DController.showLattice,
    torus2DController.speed,
    quantumController.config,
    quantumController.playing,
    quantumController.quantity,
    quantumController.showLattice,
    quantumController.speed,
    fixedQuantumController.config,
    fixedQuantumController.playing,
    fixedQuantumController.quantity,
    fixedQuantumController.showLattice,
    fixedQuantumController.speed,
    square2DQuantumController.config,
    square2DQuantumController.playing,
    square2DQuantumController.quantity,
    square2DQuantumController.showLattice,
    square2DQuantumController.speed,
    torus2DQuantumController.config,
    torus2DQuantumController.playing,
    torus2DQuantumController.quantity,
    torus2DQuantumController.showLattice,
    torus2DQuantumController.speed,
  ]);

  useEffect(() => {
    if (!restoreCompleteRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const nextSearch = buildSceneSearch(
        activeSceneState,
        window.location.search,
        {
          preserveEmbed: true,
        },
      );

      if (`${window.location.search}` !== nextSearch) {
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${nextSearch}`,
        );
      }
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSceneState]);

  const stationaryNote =
    mode === 'quantum-one-particle' &&
    activeController.config.initialPreset === 'selected-normal-mode' &&
    (activeController.quantity === 'probability-density' ||
      activeController.quantity === 'magnitude')
      ? 'A single normal mode is a stationary state: only its global phase evolves in time, so its probability distribution stays constant. Choose the real part, imaginary part, or complex-amplitude view to see the phase rotate.'
      : undefined;

  return (
    <SimulationShell embedded={embedded}>
      <section
        className="scene-layout"
        data-display-time={activeController.displayTime}
        data-testid="scene-layout"
      >
        <div className="control-column">
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
              circleLayout={classicalController.circleLayout}
              showLattice={classical1DBranch.showLattice}
              showSprings={classical1DBranch.showSprings}
              speed={classical1DBranch.speed}
              onConfigChange={(next) => {
                if (geometry === 'fixed-interval') {
                  fixedClassicalController.setConfig(
                    next as Parameters<
                      typeof fixedClassicalController.setConfig
                    >[0],
                  );
                } else {
                  classicalController.setConfig(
                    next as Parameters<typeof classicalController.setConfig>[0],
                  );
                }
              }}
              onModeChange={handleModeChange}
              onGeometryChange={(next) => handleGeometryChange(next)}
              onPlayingChange={classical1DBranch.setPlaying}
              onQuantityChange={classical1DBranch.setQuantity}
              onCircleLayoutChange={classicalController.setCircleLayout}
              onReset={classical1DBranch.reset}
              onShowLatticeChange={classical1DBranch.setShowLattice}
              onShowSpringsChange={classical1DBranch.setShowSprings}
              onSpeedChange={classical1DBranch.setSpeed}
              onStep={classical1DBranch.stepOnce}
              view1d={oneDView}
              onView1dChange={setOneDView}
            />
          ) : mode === 'quantum-one-particle' && isGeometry2D(geometry) ? (
            <Quantum2DControls
              config={quantum2DBranch.config}
              geometry={geometry}
              mode={mode}
              playing={quantum2DBranch.playing}
              quantity={quantum2DBranch.quantity}
              showLattice={quantum2DBranch.showLattice}
              speed={quantum2DBranch.speed}
              onConfigChange={quantum2DBranch.setConfig}
              onGeometryChange={(next) => handleGeometryChange(next)}
              onModeChange={handleModeChange}
              onPlayingChange={quantum2DBranch.setPlaying}
              onQuantityChange={quantum2DBranch.setQuantity}
              onReset={quantum2DBranch.reset}
              onShowLatticeChange={quantum2DBranch.setShowLattice}
              onSpeedChange={quantum2DBranch.setSpeed}
              onStep={quantum2DBranch.stepOnce}
            />
          ) : (
            <QuantumPrototypeControls
              config={quantum1DBranch.config}
              geometry={geometry as Geometry1D}
              mode={mode}
              playing={quantum1DBranch.playing}
              quantity={quantum1DBranch.quantity}
              showLattice={quantum1DBranch.showLattice}
              speed={quantum1DBranch.speed}
              onConfigChange={quantum1DBranch.setConfig}
              onModeChange={handleModeChange}
              onGeometryChange={(next) => handleGeometryChange(next)}
              onPlayingChange={quantum1DBranch.setPlaying}
              onQuantityChange={quantum1DBranch.setQuantity}
              onReset={quantum1DBranch.reset}
              onShowLatticeChange={quantum1DBranch.setShowLattice}
              onSpeedChange={quantum1DBranch.setSpeed}
              onStep={quantum1DBranch.stepOnce}
              view1d={oneDView}
              onView1dChange={setOneDView}
            />
          )}
        </div>
        <div className="visual-column">
          <PrototypeCanvas
            frameChannel={activeController.frameChannel}
            infoNote={stationaryNote}
            circleLayout={
              mode === 'classical' &&
              geometry === 'periodic-circle' &&
              activeController.quantity === 'displacement'
                ? classicalController.circleLayout
                : 'radial'
            }
            circleGeometryMode={
              geometry === 'periodic-circle-fixed' ? 'fixed' : 'deformed'
            }
            oneDView={oneDView}
            quantity={activeController.quantity}
            showLattice={activeController.showLattice}
            showSprings={
              mode === 'classical'
                ? isPeriodicCircleGeometry(geometry)
                  ? classicalController.showSprings
                  : geometry === 'fixed-interval'
                    ? fixedClassicalController.showSprings
                    : false
                : false
            }
            snapshot={activeController.snapshot}
          />
        </div>
      </section>
    </SimulationShell>
  );
}

function isGeometry2D(geometry: Geometry): geometry is Geometry2D {
  return geometry === 'square-fixed' || geometry === 'torus-periodic';
}

function isPeriodicCircleGeometry(
  geometry: Geometry,
): geometry is 'periodic-circle' | 'periodic-circle-fixed' {
  return geometry === 'periodic-circle' || geometry === 'periodic-circle-fixed';
}

function applySceneState(
  scene: SceneStateV1,
  controllers: {
    setMode: (mode: AppMode) => void;
    setGeometry: (geometry: Geometry) => void;
    classicalController: ReturnType<typeof usePeriodicClassicalPrototype>;
    fixedClassicalController: ReturnType<typeof useFixedClassicalPrototype>;
    square2DController: ReturnType<typeof useClassical2DPrototype>;
    torus2DController: ReturnType<typeof useClassical2DPrototype>;
    quantumController: ReturnType<typeof usePeriodicQuantumPrototype>;
    fixedQuantumController: ReturnType<typeof useFixedQuantumPrototype>;
    square2DQuantumController: ReturnType<typeof useQuantum2DPrototype>;
    torus2DQuantumController: ReturnType<typeof useQuantum2DPrototype>;
  },
): void {
  controllers.setMode(scene.mode);
  controllers.setGeometry(scene.geometry);

  switch (`${scene.mode}:${scene.geometry}`) {
    case 'classical:periodic-circle':
      controllers.classicalController.setConfig(
        scene.config as typeof defaultClassical1DPeriodicConfig,
      );
      controllers.classicalController.setQuantity(
        scene.quantity as typeof controllers.classicalController.quantity,
      );
      controllers.classicalController.setCircleLayout(
        scene.circleLayout ?? 'radial',
      );
      controllers.classicalController.setPlaying(scene.playing);
      controllers.classicalController.setSpeed(scene.speed);
      controllers.classicalController.setShowLattice(scene.showLattice);
      controllers.classicalController.setShowSprings(scene.showSprings);
      break;
    case 'classical:periodic-circle-fixed':
      controllers.classicalController.setConfig(
        scene.config as typeof defaultClassical1DPeriodicConfig,
      );
      controllers.classicalController.setQuantity(
        scene.quantity as typeof controllers.classicalController.quantity,
      );
      controllers.classicalController.setPlaying(scene.playing);
      controllers.classicalController.setSpeed(scene.speed);
      controllers.classicalController.setShowLattice(scene.showLattice);
      controllers.classicalController.setShowSprings(scene.showSprings);
      break;
    case 'classical:fixed-interval':
      controllers.fixedClassicalController.setConfig(
        scene.config as typeof defaultClassical1DFixedConfig,
      );
      controllers.fixedClassicalController.setQuantity(
        scene.quantity as typeof controllers.fixedClassicalController.quantity,
      );
      controllers.fixedClassicalController.setPlaying(scene.playing);
      controllers.fixedClassicalController.setSpeed(scene.speed);
      controllers.fixedClassicalController.setShowLattice(scene.showLattice);
      controllers.fixedClassicalController.setShowSprings(scene.showSprings);
      break;
    case 'classical:square-fixed':
      controllers.square2DController.setConfig(
        scene.config as typeof defaultClassical2DSquareConfig,
      );
      controllers.square2DController.setQuantity(
        scene.quantity as typeof controllers.square2DController.quantity,
      );
      controllers.square2DController.setPlaying(scene.playing);
      controllers.square2DController.setSpeed(scene.speed);
      controllers.square2DController.setShowLattice(scene.showLattice);
      break;
    case 'classical:torus-periodic':
      controllers.torus2DController.setConfig(
        scene.config as typeof defaultClassical2DTorusConfig,
      );
      controllers.torus2DController.setQuantity(
        scene.quantity as typeof controllers.torus2DController.quantity,
      );
      controllers.torus2DController.setPlaying(scene.playing);
      controllers.torus2DController.setSpeed(scene.speed);
      controllers.torus2DController.setShowLattice(scene.showLattice);
      break;
    case 'quantum-one-particle:periodic-circle':
      controllers.quantumController.setConfig(
        scene.config as typeof defaultQuantum1DPeriodicConfig,
      );
      controllers.quantumController.setQuantity(
        scene.quantity as typeof controllers.quantumController.quantity,
      );
      controllers.quantumController.setPlaying(scene.playing);
      controllers.quantumController.setSpeed(scene.speed);
      controllers.quantumController.setShowLattice(scene.showLattice);
      break;
    case 'quantum-one-particle:periodic-circle-fixed':
      controllers.quantumController.setConfig(
        scene.config as typeof defaultQuantum1DPeriodicConfig,
      );
      controllers.quantumController.setQuantity(
        scene.quantity as typeof controllers.quantumController.quantity,
      );
      controllers.quantumController.setPlaying(scene.playing);
      controllers.quantumController.setSpeed(scene.speed);
      controllers.quantumController.setShowLattice(scene.showLattice);
      break;
    case 'quantum-one-particle:fixed-interval':
      controllers.fixedQuantumController.setConfig(
        scene.config as typeof defaultQuantum1DFixedConfig,
      );
      controllers.fixedQuantumController.setQuantity(
        scene.quantity as typeof controllers.fixedQuantumController.quantity,
      );
      controllers.fixedQuantumController.setPlaying(scene.playing);
      controllers.fixedQuantumController.setSpeed(scene.speed);
      controllers.fixedQuantumController.setShowLattice(scene.showLattice);
      break;
    case 'quantum-one-particle:square-fixed':
      controllers.square2DQuantumController.setConfig(
        scene.config as typeof defaultQuantum2DSquareConfig,
      );
      controllers.square2DQuantumController.setQuantity(
        scene.quantity as typeof controllers.square2DQuantumController.quantity,
      );
      controllers.square2DQuantumController.setPlaying(scene.playing);
      controllers.square2DQuantumController.setSpeed(scene.speed);
      controllers.square2DQuantumController.setShowLattice(scene.showLattice);
      break;
    case 'quantum-one-particle:torus-periodic':
      controllers.torus2DQuantumController.setConfig(
        scene.config as typeof defaultQuantum2DTorusConfig,
      );
      controllers.torus2DQuantumController.setQuantity(
        scene.quantity as typeof controllers.torus2DQuantumController.quantity,
      );
      controllers.torus2DQuantumController.setPlaying(scene.playing);
      controllers.torus2DQuantumController.setSpeed(scene.speed);
      controllers.torus2DQuantumController.setShowLattice(scene.showLattice);
      break;
  }
}
