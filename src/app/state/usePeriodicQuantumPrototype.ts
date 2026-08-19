import { useEffect, useRef, useState } from 'react';
import { defaultQuantum1DPeriodicConfig } from '../presets/quantum1dPeriodic';
import {
  createFrameChannel,
  DIAGNOSTICS_UPDATE_INTERVAL_SECONDS,
  MAX_FRAME_ELAPSED_SECONDS,
  PlaybackRateTracker,
  type FrameChannel,
} from './frameChannel';
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
  readonly frameChannel: FrameChannel<Quantum1DPeriodicSnapshot>;
  readonly displayTime: number;
  readonly achievedSpeedRatio: number | null;
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
  const simulatedTimeRef = useRef(0);
  const quantityRef = useRef<Quantum1DPeriodicQuantity>('probability-density');
  const channelRef = useRef<FrameChannel<Quantum1DPeriodicSnapshot> | null>(null);
  channelRef.current ??= createFrameChannel<Quantum1DPeriodicSnapshot>();
  const frameChannel = channelRef.current;
  const rateTrackerRef = useRef(new PlaybackRateTracker());

  const [snapshot, setSnapshot] = useState<Quantum1DPeriodicSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Quantum1DPeriodicDiagnostics>(() =>
    engineRef.current.getDiagnostics(),
  );
  const [displayTime, setDisplayTime] = useState(0);
  const [achievedSpeedRatio, setAchievedSpeedRatio] = useState<number | null>(null);

  useEffect(() => {
    engineRef.current.reset(config);
    simulatedTimeRef.current = 0;
    rateTrackerRef.current.reset();
    const freshSnapshot = engineRef.current.getSnapshot(quantityRef.current);
    setSnapshot(freshSnapshot);
    frameChannel.publish(freshSnapshot);
    setDiagnostics(engineRef.current.getDiagnostics());
    setDisplayTime(0);
    setAchievedSpeedRatio(null);
  }, [config, frameChannel]);

  useEffect(() => {
    quantityRef.current = quantity;
    const freshSnapshot = engineRef.current.getSnapshot(quantity);
    setSnapshot(freshSnapshot);
    frameChannel.publish(freshSnapshot);
    setDiagnostics(engineRef.current.getDiagnostics());
  }, [quantity, frameChannel]);

  useEffect(() => {
    if (!active || !playing) {
      return undefined;
    }

    let frameId = 0;
    let lastTimestamp = 0;
    let diagnosticsElapsed = 0;

    const renderFrame = (timestamp: number): void => {
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
      }

      // Cap a single frame's contribution: brief hiccups jump straight to the
      // correct target time; long gaps (hidden tab) count as paused time.
      const elapsedSeconds = Math.min(
        (timestamp - lastTimestamp) / 1000,
        MAX_FRAME_ELAPSED_SECONDS,
      );
      lastTimestamp = timestamp;

      if (elapsedSeconds > 0) {
        simulatedTimeRef.current += elapsedSeconds * speed;
        engineRef.current.setTime(simulatedTimeRef.current);
        frameChannel.publish(engineRef.current.getSnapshot(quantityRef.current));
        rateTrackerRef.current.addFrame(elapsedSeconds, elapsedSeconds * speed);

        diagnosticsElapsed += elapsedSeconds;
        if (diagnosticsElapsed >= DIAGNOSTICS_UPDATE_INTERVAL_SECONDS) {
          diagnosticsElapsed = 0;
          setDiagnostics(engineRef.current.getDiagnostics());
          setDisplayTime(simulatedTimeRef.current);
          setAchievedSpeedRatio(rateTrackerRef.current.sampleAndReset());
        }
      }

      frameId = window.requestAnimationFrame(renderFrame);
    };

    frameId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [active, playing, speed, frameChannel]);

  return {
    config,
    quantity,
    playing,
    speed,
    showLattice,
    snapshot,
    diagnostics,
    frameChannel,
    displayTime,
    achievedSpeedRatio,
    setConfig,
    setQuantity,
    setPlaying,
    setSpeed,
    setShowLattice,
    reset: () => {
      engineRef.current.reset(config);
      simulatedTimeRef.current = 0;
      rateTrackerRef.current.reset();
      const freshSnapshot = engineRef.current.getSnapshot(quantity);
      setSnapshot(freshSnapshot);
      frameChannel.publish(freshSnapshot);
      setDiagnostics(engineRef.current.getDiagnostics());
      setDisplayTime(0);
      setAchievedSpeedRatio(null);
    },
    stepOnce: () => {
      // Explicit single step: advances by one phase-sampling interval
      // (recommendedDt), the resolution used to sample the fastest mode.
      const nextDt = engineRef.current.getDiagnostics().recommendedDt;
      simulatedTimeRef.current += nextDt;
      engineRef.current.setTime(simulatedTimeRef.current);
      const freshSnapshot = engineRef.current.getSnapshot(quantity);
      setSnapshot(freshSnapshot);
      frameChannel.publish(freshSnapshot);
      setDiagnostics(engineRef.current.getDiagnostics());
      setDisplayTime(simulatedTimeRef.current);
    },
  };
}
