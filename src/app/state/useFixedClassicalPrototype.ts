import { useEffect, useRef, useState } from 'react';
import { defaultClassical1DFixedConfig } from '../presets/classical1dFixed';
import { advanceSimulationClock } from './simulationClock';
import {
  createFrameChannel,
  DIAGNOSTICS_UPDATE_INTERVAL_SECONDS,
  PlaybackRateTracker,
  type FrameChannel,
} from './frameChannel';
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
  readonly frameChannel: FrameChannel<Classical1DFixedSnapshot>;
  readonly displayTime: number;
  readonly achievedSpeedRatio: number | null;
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
  const simulatedTimeRef = useRef(0);
  const quantityRef = useRef<Classical1DFixedQuantity>('displacement');
  const channelRef = useRef<FrameChannel<Classical1DFixedSnapshot> | null>(null);
  channelRef.current ??= createFrameChannel<Classical1DFixedSnapshot>();
  const frameChannel = channelRef.current;
  const rateTrackerRef = useRef(new PlaybackRateTracker());
  const [snapshot, setSnapshot] = useState<Classical1DFixedSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Classical1DFixedDiagnostics>(() =>
    engineRef.current.getDiagnostics(),
  );
  const [displayTime, setDisplayTime] = useState(0);
  const [achievedSpeedRatio, setAchievedSpeedRatio] = useState<number | null>(null);

  useEffect(() => {
    engineRef.current.reset(config);
    carrySecondsRef.current = 0;
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
      const elapsedSeconds = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      const clockState = advanceSimulationClock(
        engineRef.current,
        elapsedSeconds,
        speed,
        carrySecondsRef.current,
      );
      carrySecondsRef.current = clockState.carrySeconds;
      simulatedTimeRef.current += clockState.simulatedSeconds;

      if (clockState.consumedSubsteps > 0) {
        frameChannel.publish(engineRef.current.getSnapshot(quantityRef.current));
      }

      rateTrackerRef.current.addFrame(elapsedSeconds, clockState.simulatedSeconds);
      diagnosticsElapsed += elapsedSeconds;
      if (diagnosticsElapsed >= DIAGNOSTICS_UPDATE_INTERVAL_SECONDS) {
        diagnosticsElapsed = 0;
        setDiagnostics(engineRef.current.getDiagnostics());
        setDisplayTime(simulatedTimeRef.current);
        setAchievedSpeedRatio(rateTrackerRef.current.sampleAndReset());
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
    showSprings,
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
    setShowSprings,
    reset: () => {
      engineRef.current.reset(config);
      carrySecondsRef.current = 0;
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
      // Explicit single step: one stable leapfrog step of recommendedDt.
      const nextDt = engineRef.current.getDiagnostics().recommendedDt;
      engineRef.current.step(nextDt);
      carrySecondsRef.current = 0;
      simulatedTimeRef.current += nextDt;
      const freshSnapshot = engineRef.current.getSnapshot(quantity);
      setSnapshot(freshSnapshot);
      frameChannel.publish(freshSnapshot);
      setDiagnostics(engineRef.current.getDiagnostics());
      setDisplayTime(simulatedTimeRef.current);
    },
  };
}
