import { useEffect, useRef, useState } from 'react';
import { defaultQuantum1DFixedConfig } from '../presets/quantum1dFixed';
import {
  createFrameChannel,
  DIAGNOSTICS_UPDATE_INTERVAL_SECONDS,
  MAX_FRAME_ELAPSED_SECONDS,
  PlaybackRateTracker,
  type FrameChannel,
} from './frameChannel';
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
  readonly frameChannel: FrameChannel<Quantum1DFixedSnapshot>;
  readonly displayTime: number;
  readonly achievedSpeedRatio: number | null;
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
  const simulatedTimeRef = useRef(0);
  const quantityRef = useRef<Quantum1DFixedQuantity>('probability-density');
  const channelRef = useRef<FrameChannel<Quantum1DFixedSnapshot> | null>(null);
  channelRef.current ??= createFrameChannel<Quantum1DFixedSnapshot>();
  const frameChannel = channelRef.current;
  const rateTrackerRef = useRef(new PlaybackRateTracker());

  const [snapshot, setSnapshot] = useState<Quantum1DFixedSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Quantum1DFixedDiagnostics>(() =>
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
    return () => window.cancelAnimationFrame(frameId);
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
      // Explicit single step: one phase-sampling interval (recommendedDt).
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
