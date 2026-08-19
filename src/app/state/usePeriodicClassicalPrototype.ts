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
import {
  createFrameChannel,
  DIAGNOSTICS_UPDATE_INTERVAL_SECONDS,
  PlaybackRateTracker,
  type FrameChannel,
} from './frameChannel';

interface PrototypeControllerState {
  readonly config: Classical1DPeriodicConfig;
  readonly quantity: Classical1DPeriodicQuantity;
  readonly circleLayout: 'radial' | 'longitudinal';
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly snapshot: Classical1DPeriodicSnapshot;
  readonly diagnostics: Classical1DPeriodicDiagnostics;
  readonly frameChannel: FrameChannel<Classical1DPeriodicSnapshot>;
  readonly displayTime: number;
  readonly achievedSpeedRatio: number | null;
  readonly setConfig: (config: Classical1DPeriodicConfig) => void;
  readonly setQuantity: (quantity: Classical1DPeriodicQuantity) => void;
  readonly setCircleLayout: (layout: 'radial' | 'longitudinal') => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly setSpeed: (speed: number) => void;
  readonly setShowLattice: (showLattice: boolean) => void;
  readonly setShowSprings: (showSprings: boolean) => void;
  readonly reset: () => void;
  readonly stepOnce: () => void;
}

export function usePeriodicClassicalPrototype(active = true): PrototypeControllerState {
  const [config, setConfig] = useState(defaultClassical1DPeriodicConfig);
  const [quantity, setQuantity] = useState<Classical1DPeriodicQuantity>('displacement');
  const [circleLayout, setCircleLayout] = useState<'radial' | 'longitudinal'>('radial');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLattice, setShowLattice] = useState(true);
  const [showSprings, setShowSprings] = useState(true);

  const engineRef = useRef(new Classical1DPeriodicEngine(defaultClassical1DPeriodicConfig));
  const carrySecondsRef = useRef(0);
  const simulatedTimeRef = useRef(0);
  const quantityRef = useRef<Classical1DPeriodicQuantity>('displacement');
  const channelRef = useRef<FrameChannel<Classical1DPeriodicSnapshot> | null>(null);
  channelRef.current ??= createFrameChannel<Classical1DPeriodicSnapshot>();
  const frameChannel = channelRef.current;
  const rateTrackerRef = useRef(new PlaybackRateTracker());

  const [snapshot, setSnapshot] = useState<Classical1DPeriodicSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Classical1DPeriodicDiagnostics>(() =>
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

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [active, playing, speed, frameChannel]);

  return {
    config,
    quantity,
    circleLayout,
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
    setCircleLayout,
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
