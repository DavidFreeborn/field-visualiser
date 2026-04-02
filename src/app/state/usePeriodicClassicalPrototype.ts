import { useEffect, useRef, useState } from 'react';
import { defaultClassical1DPeriodicConfig } from '../presets/classical1dPeriodic';
import {
  Classical1DPeriodicEngine,
  type Classical1DPeriodicConfig,
  type Classical1DPeriodicDiagnostics,
  type Classical1DPeriodicQuantity,
  type Classical1DPeriodicSnapshot,
} from '../../physics/classical/classical1dPeriodic';
import { advanceSimulationClock } from './simulationClock';

interface PrototypeControllerState {
  readonly config: Classical1DPeriodicConfig;
  readonly quantity: Classical1DPeriodicQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly snapshot: Classical1DPeriodicSnapshot;
  readonly diagnostics: Classical1DPeriodicDiagnostics;
  readonly setConfig: (config: Classical1DPeriodicConfig) => void;
  readonly setQuantity: (quantity: Classical1DPeriodicQuantity) => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly setSpeed: (speed: number) => void;
  readonly setShowLattice: (showLattice: boolean) => void;
  readonly setShowSprings: (showSprings: boolean) => void;
  readonly reset: () => void;
  readonly stepOnce: () => void;
}

export function usePeriodicClassicalPrototype(): PrototypeControllerState {
  const [config, setConfig] = useState(defaultClassical1DPeriodicConfig);
  const [quantity, setQuantity] = useState<Classical1DPeriodicQuantity>('displacement');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLattice, setShowLattice] = useState(true);
  const [showSprings, setShowSprings] = useState(true);

  const engineRef = useRef(new Classical1DPeriodicEngine(defaultClassical1DPeriodicConfig));
  const carrySecondsRef = useRef(0);
  const quantityRef = useRef<Classical1DPeriodicQuantity>('displacement');

  const [snapshot, setSnapshot] = useState<Classical1DPeriodicSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Classical1DPeriodicDiagnostics>(() =>
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

      if (playing) {
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
  }, [playing, quantity, speed]);

  return {
    config,
    quantity,
    playing,
    speed,
    showLattice,
    showSprings,
    snapshot,
    diagnostics,
    setConfig,
    setQuantity,
    setPlaying,
    setSpeed,
    setShowLattice,
    setShowSprings,
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
