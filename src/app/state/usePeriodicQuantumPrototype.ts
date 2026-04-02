import { useEffect, useRef, useState } from 'react';
import { defaultQuantum1DPeriodicConfig } from '../presets/quantum1dPeriodic';
import { advanceSimulationClock } from './simulationClock';
import {
  Quantum1DPeriodicEngine,
  type Quantum1DPeriodicConfig,
  type Quantum1DPeriodicDiagnostics,
  type Quantum1DPeriodicQuantity,
  type Quantum1DPeriodicSnapshot,
} from '../../physics/quantum/quantum1dPeriodic';

interface QuantumPrototypeControllerState {
  readonly config: Quantum1DPeriodicConfig;
  readonly quantity: Quantum1DPeriodicQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly snapshot: Quantum1DPeriodicSnapshot;
  readonly diagnostics: Quantum1DPeriodicDiagnostics;
  readonly setConfig: (config: Quantum1DPeriodicConfig) => void;
  readonly setQuantity: (quantity: Quantum1DPeriodicQuantity) => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly setSpeed: (speed: number) => void;
  readonly setShowLattice: (showLattice: boolean) => void;
  readonly reset: () => void;
  readonly stepOnce: () => void;
}

export function usePeriodicQuantumPrototype(active = true): QuantumPrototypeControllerState {
  const [config, setConfig] = useState(defaultQuantum1DPeriodicConfig);
  const [quantity, setQuantity] = useState<Quantum1DPeriodicQuantity>('probability-density');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLattice, setShowLattice] = useState(true);

  const engineRef = useRef(new Quantum1DPeriodicEngine(defaultQuantum1DPeriodicConfig));
  const carrySecondsRef = useRef(0);
  const quantityRef = useRef<Quantum1DPeriodicQuantity>('probability-density');

  const [snapshot, setSnapshot] = useState<Quantum1DPeriodicSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Quantum1DPeriodicDiagnostics>(() =>
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

    return () => {
      window.cancelAnimationFrame(frameId);
    };
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
