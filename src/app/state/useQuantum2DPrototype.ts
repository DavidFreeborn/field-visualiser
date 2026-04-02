import { useEffect, useRef, useState } from 'react';
import { defaultQuantum2DSquareConfig } from '../presets/quantum2dSquare';
import { defaultQuantum2DTorusConfig } from '../presets/quantum2dTorus';
import { advanceSimulationClock } from './simulationClock';
import {
  Quantum2DFixedEngine,
  type Quantum2DFixedConfig,
  type Quantum2DFixedDiagnostics,
  type Quantum2DFixedQuantity,
  type Quantum2DFixedSnapshot,
} from '../../physics/quantum/quantum2dFixed';
import {
  Quantum2DPeriodicEngine,
  type Quantum2DPeriodicConfig,
  type Quantum2DPeriodicDiagnostics,
  type Quantum2DPeriodicQuantity,
  type Quantum2DPeriodicSnapshot,
} from '../../physics/quantum/quantum2dPeriodic';
import type { Quantum2DInitialPreset } from '../../physics/quantum/initialStates2d';

type Quantum2DGeometry = 'square-fixed' | 'torus-periodic';
type Quantum2DConfig = Quantum2DFixedConfig | Quantum2DPeriodicConfig;
type Quantum2DQuantity = Quantum2DFixedQuantity | Quantum2DPeriodicQuantity;
type Quantum2DSnapshot = Quantum2DFixedSnapshot | Quantum2DPeriodicSnapshot;
type Quantum2DDiagnostics = Quantum2DFixedDiagnostics | Quantum2DPeriodicDiagnostics;

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
  const engineRef = useRef(
    geometry === 'square-fixed'
      ? new Quantum2DFixedEngine(defaultQuantum2DSquareConfig)
      : new Quantum2DPeriodicEngine(defaultQuantum2DTorusConfig),
  );
  const carrySecondsRef = useRef(0);
  const quantityRef = useRef<Quantum2DQuantity>('probability-density');
  const [snapshot, setSnapshot] = useState<Quantum2DSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Quantum2DDiagnostics>(() =>
    engineRef.current.getDiagnostics(),
  );

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

  useEffect(() => {
    engineRef.current =
      geometry === 'square-fixed'
        ? new Quantum2DFixedEngine(config as Quantum2DFixedConfig)
        : new Quantum2DPeriodicEngine(config as Quantum2DPeriodicConfig);
    carrySecondsRef.current = 0;
    setSnapshot(engineRef.current.getSnapshot(quantityRef.current));
    setDiagnostics(engineRef.current.getDiagnostics());
  }, [config, geometry]);

  useEffect(() => {
    quantityRef.current = quantity;
    setSnapshot(engineRef.current.getSnapshot(quantity));
    setDiagnostics(engineRef.current.getDiagnostics());
  }, [quantity]);

  useEffect(() => {
    let frameId = 0;
    let lastTimestamp = 0;

    const renderFrame = (timestamp: number): void => {
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
      }

      const elapsedSeconds = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      if (active && playing) {
        const clockState = advanceSimulationClock(
          engineRef.current,
          elapsedSeconds,
          speed,
          carrySecondsRef.current,
        );
        carrySecondsRef.current = clockState.carrySeconds;

        if (clockState.consumedSubsteps > 0) {
          setSnapshot(engineRef.current.getSnapshot(quantity));
          setDiagnostics(engineRef.current.getDiagnostics());
        }
      }

      frameId = window.requestAnimationFrame(renderFrame);
    };

    frameId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, [active, playing, quantity, speed]);

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
      engineRef.current =
        geometry === 'square-fixed'
          ? new Quantum2DFixedEngine(config as Quantum2DFixedConfig)
          : new Quantum2DPeriodicEngine(config as Quantum2DPeriodicConfig);
      carrySecondsRef.current = 0;
      setSnapshot(engineRef.current.getSnapshot(quantity));
      setDiagnostics(engineRef.current.getDiagnostics());
    },
    stepOnce: () => {
      const nextDt = engineRef.current.getDiagnostics().recommendedDt;
      engineRef.current.step(nextDt);
      carrySecondsRef.current = 0;
      setSnapshot(engineRef.current.getSnapshot(quantity));
      setDiagnostics(engineRef.current.getDiagnostics());
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
