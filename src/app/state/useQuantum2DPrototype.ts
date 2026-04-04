import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { defaultQuantum2DSquareConfig } from '../presets/quantum2dSquare';
import { defaultQuantum2DTorusConfig } from '../presets/quantum2dTorus';
import {
  Quantum2DFixedEngine,
  type Quantum2DFixedConfig,
} from '../../physics/quantum/quantum2dFixed';
import {
  Quantum2DPeriodicEngine,
  type Quantum2DPeriodicConfig,
} from '../../physics/quantum/quantum2dPeriodic';
import type { Quantum2DInitialPreset } from '../../physics/quantum/initialStates2d';
import type {
  Quantum2DConfig,
  Quantum2DDiagnostics,
  Quantum2DGeometry,
  Quantum2DQuantity,
  Quantum2DSnapshot,
  Quantum2DWorkerResponse,
} from '../workers/quantum2DProtocol';

type WorkerBackedEngine = (Quantum2DFixedEngine | Quantum2DPeriodicEngine) & {
  setTime(time: number): void;
};

interface Quantum2DControllerState {
  readonly config: Quantum2DConfig;
  readonly quantity: Quantum2DQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly snapshot: Quantum2DSnapshot;
  readonly diagnostics: Quantum2DDiagnostics;
  readonly setConfig: (config: Quantum2DConfig) => void;
  readonly setQuantity: (quantity: Quantum2DQuantity) => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly setSpeed: (speed: number) => void;
  readonly setShowLattice: (showLattice: boolean) => void;
  readonly reset: () => void;
  readonly stepOnce: () => void;
}

export function useQuantum2DPrototype(
  geometry: Quantum2DGeometry,
  active = true,
): Quantum2DControllerState {
  const [config, setConfig] = useState<Quantum2DConfig>(getDefaultConfig(geometry));
  const [quantity, setQuantity] = useState<Quantum2DQuantity>('probability-density');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLattice, setShowLattice] = useState(false);
  const [executionMode, setExecutionMode] = useState<'worker' | 'local'>(
    typeof Worker === 'undefined' ? 'local' : 'worker',
  );

  const localEngineRef = useRef<WorkerBackedEngine>(
    geometry === 'square-fixed'
      ? new Quantum2DFixedEngine(defaultQuantum2DSquareConfig)
      : new Quantum2DPeriodicEngine(defaultQuantum2DTorusConfig),
  );
  const workerRef = useRef<Worker | null>(null);
  const simulatedTimeRef = useRef(0);
  const pendingElapsedRef = useRef(0);
  const workerAdvanceInFlightRef = useRef(false);
  const playingRef = useRef(playing);
  const activeRef = useRef(active);
  const speedRef = useRef(speed);
  const quantityRef = useRef<Quantum2DQuantity>('probability-density');
  const configRef = useRef<Quantum2DConfig>(config);
  const geometryRef = useRef<Quantum2DGeometry>(geometry);
  const [snapshot, setSnapshot] = useState<Quantum2DSnapshot>(() =>
    localEngineRef.current.getDisplaySnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Quantum2DDiagnostics>(() =>
    localEngineRef.current.getDiagnostics(),
  );

  playingRef.current = playing;
  activeRef.current = active;
  speedRef.current = speed;
  quantityRef.current = quantity;
  configRef.current = config;
  geometryRef.current = geometry;

  useEffect(() => {
    const nextConfig = getDefaultConfig(geometry);
    setConfig((currentConfig) => ({
      ...nextConfig,
      initialPreset: sanitizePreset(currentConfig.initialPreset, geometry),
      size: currentConfig.size,
      waveSpeed: currentConfig.waveSpeed,
      domainLength: currentConfig.domainLength,
      initialCenterX: currentConfig.initialCenterX,
      initialCenterY: currentConfig.initialCenterY,
      gaussianWidth: currentConfig.gaussianWidth,
      momentumWidth: currentConfig.momentumWidth,
      modeNumberX: currentConfig.modeNumberX,
      modeNumberY: currentConfig.modeNumberY,
    }));
  }, [geometry]);

  const tryDispatchWorkerAdvance = useEffectEvent(() => {
    if (
      executionMode !== 'worker' ||
      workerRef.current === null ||
      workerAdvanceInFlightRef.current ||
      pendingElapsedRef.current <= 0
    ) {
      return;
    }

    const elapsedSeconds = pendingElapsedRef.current;
    pendingElapsedRef.current = 0;
    workerAdvanceInFlightRef.current = true;
    workerRef.current.postMessage({
      type: 'advance',
      elapsedSeconds,
      speed: speedRef.current,
    });
  });

  const fallbackToLocalMode = useEffectEvent(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    workerAdvanceInFlightRef.current = false;
    pendingElapsedRef.current = 0;
    setExecutionMode('local');
    localEngineRef.current =
      geometryRef.current === 'square-fixed'
        ? new Quantum2DFixedEngine(configRef.current as Quantum2DFixedConfig)
        : new Quantum2DPeriodicEngine(configRef.current as Quantum2DPeriodicConfig);
    simulatedTimeRef.current = snapshot.time;
    localEngineRef.current.setTime(simulatedTimeRef.current);
    setSnapshot(localEngineRef.current.getDisplaySnapshot(quantityRef.current));
    setDiagnostics(localEngineRef.current.getDiagnostics());
  });

  useEffect(() => {
    if (executionMode !== 'worker') {
      return undefined;
    }

    let disposed = false;

    try {
      const worker = new Worker(new URL('../workers/quantum2D.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
      workerAdvanceInFlightRef.current = false;
      pendingElapsedRef.current = 0;
      simulatedTimeRef.current = 0;

      worker.onmessage = (event: MessageEvent<Quantum2DWorkerResponse>) => {
        if (disposed) {
          return;
        }

        if (event.data.type === 'error') {
          fallbackToLocalMode();
          return;
        }

        workerAdvanceInFlightRef.current = false;
        setSnapshot(event.data.snapshot);
        setDiagnostics(event.data.diagnostics);
        if (activeRef.current && playingRef.current) {
          tryDispatchWorkerAdvance();
        }
      };

      worker.onerror = () => {
        if (!disposed) {
          fallbackToLocalMode();
        }
      };

      worker.postMessage({
        type: 'configure',
        geometry,
        config,
        quantity: quantityRef.current,
      });
    } catch {
      fallbackToLocalMode();
    }

    return () => {
      disposed = true;
      workerRef.current?.terminate();
      workerRef.current = null;
      workerAdvanceInFlightRef.current = false;
      pendingElapsedRef.current = 0;
    };
  }, [config, executionMode, fallbackToLocalMode, geometry, tryDispatchWorkerAdvance]);

  useEffect(() => {
    if (executionMode === 'worker') {
      return;
    }

    localEngineRef.current =
      geometry === 'square-fixed'
        ? new Quantum2DFixedEngine(config as Quantum2DFixedConfig)
        : new Quantum2DPeriodicEngine(config as Quantum2DPeriodicConfig);
    simulatedTimeRef.current = 0;
    setSnapshot(localEngineRef.current.getDisplaySnapshot(quantityRef.current));
    setDiagnostics(localEngineRef.current.getDiagnostics());
  }, [config, executionMode, geometry]);

  useEffect(() => {
    if (executionMode === 'worker') {
      workerRef.current?.postMessage({
        type: 'set-quantity',
        quantity,
      });
      return;
    }

    setSnapshot(localEngineRef.current.getDisplaySnapshot(quantity));
    setDiagnostics(localEngineRef.current.getDiagnostics());
  }, [executionMode, quantity]);

  useEffect(() => {
    if (!active || !playing) {
      return undefined;
    }

    let frameId = 0;
    let lastTimestamp = 0;

    const renderFrame = (timestamp: number): void => {
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
      }

      const elapsedSeconds = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      if (executionMode === 'worker') {
        pendingElapsedRef.current += elapsedSeconds;
        tryDispatchWorkerAdvance();
      } else {
        if (elapsedSeconds > 0) {
          simulatedTimeRef.current += elapsedSeconds * speed;
          localEngineRef.current.setTime(simulatedTimeRef.current);
          setSnapshot(localEngineRef.current.getDisplaySnapshot(quantityRef.current));
          setDiagnostics(localEngineRef.current.getDiagnostics());
        }
      }

      frameId = window.requestAnimationFrame(renderFrame);
    };

    frameId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, [active, executionMode, playing, speed, tryDispatchWorkerAdvance]);

  return {
    config,
    quantity,
    playing,
    speed,
    showLattice,
    snapshot,
    diagnostics,
    setConfig,
    setQuantity,
    setPlaying,
    setSpeed,
    setShowLattice,
    reset: () => {
      if (executionMode === 'worker' && workerRef.current !== null) {
        pendingElapsedRef.current = 0;
        workerAdvanceInFlightRef.current = false;
        workerRef.current.postMessage({
          type: 'configure',
          geometry,
          config,
          quantity: quantityRef.current,
        });
        return;
      }

      localEngineRef.current =
        geometry === 'square-fixed'
          ? new Quantum2DFixedEngine(config as Quantum2DFixedConfig)
          : new Quantum2DPeriodicEngine(config as Quantum2DPeriodicConfig);
      simulatedTimeRef.current = 0;
      setSnapshot(localEngineRef.current.getDisplaySnapshot(quantity));
      setDiagnostics(localEngineRef.current.getDiagnostics());
    },
    stepOnce: () => {
      if (executionMode === 'worker' && workerRef.current !== null) {
        pendingElapsedRef.current = 0;
        workerAdvanceInFlightRef.current = false;
        workerRef.current.postMessage({ type: 'step-once' });
        return;
      }

      const nextDt = localEngineRef.current.getDiagnostics().recommendedDt;
      localEngineRef.current.step(nextDt);
      simulatedTimeRef.current += nextDt;
      setSnapshot(localEngineRef.current.getDisplaySnapshot(quantity));
      setDiagnostics(localEngineRef.current.getDiagnostics());
    },
  };
}

function getDefaultConfig(geometry: Quantum2DGeometry): Quantum2DConfig {
  return geometry === 'square-fixed' ? defaultQuantum2DSquareConfig : defaultQuantum2DTorusConfig;
}

function sanitizePreset(
  preset: Quantum2DInitialPreset,
  geometry: Quantum2DGeometry,
): Quantum2DInitialPreset {
  if (geometry === 'square-fixed' && preset === 'split-superposition') {
    return 'selected-normal-mode';
  }

  return preset;
}
