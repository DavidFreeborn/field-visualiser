import { useEffect, useRef, useState } from 'react';
import { defaultClassical2DSquareConfig } from '../presets/classical2dSquare';
import { advanceSimulationClock } from './simulationClock';
import {
  Classical2DEngine,
  type Classical2DConfig,
  type Classical2DDiagnostics,
  type Classical2DGeometry,
  type Classical2DQuantity,
  type Classical2DSnapshot,
} from '../../physics/classical/classical2d';

interface Classical2DControllerState {
  readonly config: Classical2DConfig;
  readonly quantity: Classical2DQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly snapshot: Classical2DSnapshot;
  readonly diagnostics: Classical2DDiagnostics;
  readonly setConfig: (config: Classical2DConfig) => void;
  readonly setQuantity: (quantity: Classical2DQuantity) => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly setSpeed: (speed: number) => void;
  readonly setShowLattice: (showLattice: boolean) => void;
  readonly reset: () => void;
  readonly stepOnce: () => void;
}

export function useClassical2DPrototype(
  geometry: Classical2DGeometry,
  active = true,
): Classical2DControllerState {
  const [config, setConfig] = useState<Classical2DConfig>({
    ...defaultClassical2DSquareConfig,
    geometry,
  });
  const [quantity, setQuantity] = useState<Classical2DQuantity>('displacement');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLattice, setShowLattice] = useState(false);
  const engineRef = useRef(new Classical2DEngine({ ...defaultClassical2DSquareConfig, geometry }));
  const carrySecondsRef = useRef(0);
  const quantityRef = useRef<Classical2DQuantity>('displacement');
  const [snapshot, setSnapshot] = useState<Classical2DSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Classical2DDiagnostics>(() =>
    engineRef.current.getDiagnostics(),
  );

  useEffect(() => {
    setConfig((currentConfig) => ({
      ...currentConfig,
      geometry,
      initialPreset:
        geometry === 'square-fixed'
          ? currentConfig.initialPreset === 'wraparound-pulse'
            ? 'central-gaussian-displacement'
            : currentConfig.initialPreset
          : currentConfig.initialPreset === 'square-standing-mode-1-1'
            ? 'wraparound-pulse'
            : currentConfig.initialPreset,
    }));
  }, [geometry]);

  useEffect(() => {
    engineRef.current.reset(config);
    carrySecondsRef.current = 0;
    setSnapshot(engineRef.current.getSnapshot(quantityRef.current));
    setDiagnostics(engineRef.current.getDiagnostics());
  }, [config]);

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
      engineRef.current.reset(config);
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
