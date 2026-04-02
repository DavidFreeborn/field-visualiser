import { useEffect, useRef, useState } from 'react';
import { defaultQuantum1DFixedConfig } from '../presets/quantum1dFixed';
import { advanceSimulationClock } from './simulationClock';
import {
  Quantum1DFixedEngine,
  type Quantum1DFixedConfig,
  type Quantum1DFixedDiagnostics,
  type Quantum1DFixedQuantity,
  type Quantum1DFixedSnapshot,
} from '../../physics/quantum/quantum1dFixed';

interface FixedQuantumControllerState {
  readonly config: Quantum1DFixedConfig;
  readonly quantity: Quantum1DFixedQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly snapshot: Quantum1DFixedSnapshot;
  readonly diagnostics: Quantum1DFixedDiagnostics;
  readonly setConfig: (config: Quantum1DFixedConfig) => void;
  readonly setQuantity: (quantity: Quantum1DFixedQuantity) => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly setSpeed: (speed: number) => void;
  readonly setShowLattice: (showLattice: boolean) => void;
  readonly reset: () => void;
  readonly stepOnce: () => void;
}

export function useFixedQuantumPrototype(active = true): FixedQuantumControllerState {
  const [config, setConfig] = useState(defaultQuantum1DFixedConfig);
  const [quantity, setQuantity] = useState<Quantum1DFixedQuantity>('probability-density');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLattice, setShowLattice] = useState(true);
  const engineRef = useRef(new Quantum1DFixedEngine(defaultQuantum1DFixedConfig));
  const carrySecondsRef = useRef(0);
  const quantityRef = useRef<Quantum1DFixedQuantity>('probability-density');
  const [snapshot, setSnapshot] = useState<Quantum1DFixedSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Quantum1DFixedDiagnostics>(() =>
    engineRef.current.getDiagnostics(),
  );

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
