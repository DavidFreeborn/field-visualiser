import { useEffect, useRef, useState } from 'react';
import { defaultClassical1DFixedConfig } from '../presets/classical1dFixed';
import { advanceSimulationClock } from './simulationClock';
import {
  Classical1DFixedEngine,
  type Classical1DFixedConfig,
  type Classical1DFixedDiagnostics,
  type Classical1DFixedQuantity,
  type Classical1DFixedSnapshot,
} from '../../physics/classical/classical1dFixed';

interface FixedClassicalControllerState {
  readonly config: Classical1DFixedConfig;
  readonly quantity: Classical1DFixedQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly snapshot: Classical1DFixedSnapshot;
  readonly diagnostics: Classical1DFixedDiagnostics;
  readonly setConfig: (config: Classical1DFixedConfig) => void;
  readonly setQuantity: (quantity: Classical1DFixedQuantity) => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly setSpeed: (speed: number) => void;
  readonly setShowLattice: (showLattice: boolean) => void;
  readonly setShowSprings: (showSprings: boolean) => void;
  readonly reset: () => void;
  readonly stepOnce: () => void;
}

export function useFixedClassicalPrototype(active = true): FixedClassicalControllerState {
  const [config, setConfig] = useState(defaultClassical1DFixedConfig);
  const [quantity, setQuantity] = useState<Classical1DFixedQuantity>('displacement');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLattice, setShowLattice] = useState(true);
  const [showSprings, setShowSprings] = useState(true);
  const engineRef = useRef(new Classical1DFixedEngine(defaultClassical1DFixedConfig));
  const carrySecondsRef = useRef(0);
  const quantityRef = useRef<Classical1DFixedQuantity>('displacement');
  const [snapshot, setSnapshot] = useState<Classical1DFixedSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Classical1DFixedDiagnostics>(() =>
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
