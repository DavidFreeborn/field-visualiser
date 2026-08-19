import { useEffect, useRef, useState } from 'react';
import { defaultClassical2DSquareConfig } from '../presets/classical2dSquare';
import { defaultClassical2DTorusConfig } from '../presets/classical2dTorus';
import { advanceSimulationClock } from './simulationClock';
import {
  createFrameChannel,
  DIAGNOSTICS_UPDATE_INTERVAL_SECONDS,
  PlaybackRateTracker,
  type FrameChannel,
} from './frameChannel';
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
  readonly frameChannel: FrameChannel<Classical2DSnapshot>;
  readonly displayTime: number;
  readonly achievedSpeedRatio: number | null;
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
  const [config, setConfig] = useState<Classical2DConfig>(
    getDefault2DConfig(geometry),
  );
  const [quantity, setQuantity] = useState<Classical2DQuantity>('displacement');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLattice, setShowLattice] = useState(false);
  const engineRef = useRef(new Classical2DEngine(getDefault2DConfig(geometry)));
  const carrySecondsRef = useRef(0);
  const simulatedTimeRef = useRef(0);
  const quantityRef = useRef<Classical2DQuantity>('displacement');
  const channelRef = useRef<FrameChannel<Classical2DSnapshot> | null>(null);
  channelRef.current ??= createFrameChannel<Classical2DSnapshot>();
  const frameChannel = channelRef.current;
  const rateTrackerRef = useRef(new PlaybackRateTracker());
  const [snapshot, setSnapshot] = useState<Classical2DSnapshot>(() =>
    engineRef.current.getSnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Classical2DDiagnostics>(() =>
    engineRef.current.getDiagnostics(),
  );
  const [displayTime, setDisplayTime] = useState(0);
  const [achievedSpeedRatio, setAchievedSpeedRatio] = useState<number | null>(
    null,
  );

  useEffect(() => {
    // Topology-specific presets are remapped when the geometry changes: the
    // wraparound pulse and the zero-mean velocity correction only make sense
    // with periodic edges, and the sine standing mode only with pinned edges.
    setConfig((currentConfig) => ({
      ...currentConfig,
      geometry,
      initialPreset:
        geometry === 'square-fixed'
          ? currentConfig.initialPreset === 'wraparound-pulse'
            ? 'central-gaussian-displacement'
            : currentConfig.initialPreset === 'zero-mean-gaussian-velocity'
              ? 'central-gaussian-velocity'
              : currentConfig.initialPreset
          : currentConfig.initialPreset === 'square-standing-mode-1-1'
            ? 'wraparound-pulse'
            : currentConfig.initialPreset,
    }));
  }, [geometry]);

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
        frameChannel.publish(
          engineRef.current.getSnapshot(quantityRef.current),
        );
      }

      rateTrackerRef.current.addFrame(
        elapsedSeconds,
        clockState.simulatedSeconds,
      );
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

function getDefault2DConfig(geometry: Classical2DGeometry): Classical2DConfig {
  return geometry === 'square-fixed'
    ? defaultClassical2DSquareConfig
    : defaultClassical2DTorusConfig;
}
