import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { defaultQuantum2DSquareConfig } from '../presets/quantum2dSquare';
import { defaultQuantum2DTorusConfig } from '../presets/quantum2dTorus';
import {
  Quantum2DFixedEngine,
  type Quantum2DFixedConfig,
} from '../../physics/quantum/quantum2dFixed';
import {
  Quantum2DPeriodicEngine,
  type Quantum2DPeriodicConfig,
} from '../../physics/quantum/quantum2dPeriodic';
import {
  createFrameChannel,
  DIAGNOSTICS_UPDATE_INTERVAL_SECONDS,
  MAX_FRAME_ELAPSED_SECONDS,
  PlaybackRateTracker,
  type FrameChannel,
} from './frameChannel';
import { Quantum2DWorkerScheduler } from '../workers/workerScheduler';
import type {
  Quantum2DConfig,
  Quantum2DDiagnostics,
  Quantum2DGeometry,
  Quantum2DQuantity,
  Quantum2DSnapshot,
  Quantum2DWorkerResponse,
} from '../workers/quantum2DProtocol';

type WorkerBackedEngine = (Quantum2DFixedEngine | Quantum2DPeriodicEngine) & {
  setTime(time: number): void;
};

/** End-to-end field-update statistics sampled at the diagnostics cadence. */
export interface Quantum2DFieldStats {
  readonly updatesPerSecond: number | null;
  readonly lagSeconds: number;
  readonly computeMs: number;
  readonly snapshotMs: number;
}

interface Quantum2DControllerState {
  readonly config: Quantum2DConfig;
  readonly quantity: Quantum2DQuantity;
  readonly playing: boolean;
  readonly speed: number;
  readonly showLattice: boolean;
  readonly snapshot: Quantum2DSnapshot;
  readonly diagnostics: Quantum2DDiagnostics;
  readonly frameChannel: FrameChannel<Quantum2DSnapshot>;
  readonly displayTime: number;
  readonly achievedSpeedRatio: number | null;
  readonly fieldStats: Quantum2DFieldStats | null;
  readonly setConfig: (config: Quantum2DConfig) => void;
  readonly setQuantity: (quantity: Quantum2DQuantity) => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly setSpeed: (speed: number) => void;
  readonly setShowLattice: (showLattice: boolean) => void;
  readonly reset: () => void;
  readonly stepOnce: () => void;
}

export function useQuantum2DPrototype(
  geometry: Quantum2DGeometry,
  active = true,
): Quantum2DControllerState {
  const [config, setConfig] = useState<Quantum2DConfig>(
    getDefaultConfig(geometry),
  );
  const [quantity, setQuantity] = useState<Quantum2DQuantity>(
    'probability-density',
  );
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLattice, setShowLattice] = useState(false);
  const [executionMode, setExecutionMode] = useState<'worker' | 'local'>(
    typeof Worker === 'undefined' ? 'local' : 'worker',
  );

  const localEngineRef = useRef<WorkerBackedEngine>(
    geometry === 'square-fixed'
      ? new Quantum2DFixedEngine(defaultQuantum2DSquareConfig)
      : new Quantum2DPeriodicEngine(defaultQuantum2DTorusConfig),
  );
  const workerRef = useRef<Worker | null>(null);
  const schedulerRef = useRef<Quantum2DWorkerScheduler | null>(null);
  const desiredTimeRef = useRef(0);
  const quantityRef = useRef<Quantum2DQuantity>('probability-density');
  const configRef = useRef<Quantum2DConfig>(config);
  const geometryRef = useRef<Quantum2DGeometry>(geometry);
  const previousWorkerSnapshotRef = useRef<Quantum2DSnapshot | null>(null);
  const lastReplyWallMsRef = useRef(0);
  const lastReplySimTimeRef = useRef(0);
  const lastDiagnosticsWallMsRef = useRef(0);
  const forceNextStateUpdateRef = useRef(true);
  const replyCountRef = useRef(0);
  const lastSentQuantityRef = useRef<Quantum2DQuantity | null>(null);
  // Ping-pong display buffers for the local (no-Worker) fallback path, so
  // steady playback does not allocate a Float32Array per frame.
  const localDisplayBuffersRef = useRef<[Float32Array, Float32Array] | null>(
    null,
  );
  const localDisplayParityRef = useRef(0);
  const rateTrackerRef = useRef(new PlaybackRateTracker());
  const channelRef = useRef<FrameChannel<Quantum2DSnapshot> | null>(null);
  channelRef.current ??= createFrameChannel<Quantum2DSnapshot>();
  const frameChannel = channelRef.current;

  const [snapshot, setSnapshot] = useState<Quantum2DSnapshot>(() =>
    localEngineRef.current.getDisplaySnapshot(quantity),
  );
  const [diagnostics, setDiagnostics] = useState<Quantum2DDiagnostics>(() =>
    localEngineRef.current.getDiagnostics(),
  );
  const [displayTime, setDisplayTime] = useState(0);
  const [achievedSpeedRatio, setAchievedSpeedRatio] = useState<number | null>(
    null,
  );
  const [fieldStats, setFieldStats] = useState<Quantum2DFieldStats | null>(
    null,
  );
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;

  quantityRef.current = quantity;
  configRef.current = config;
  geometryRef.current = geometry;

  useEffect(() => {
    const nextConfig = getDefaultConfig(geometry);
    setConfig((currentConfig) =>
      sanitizeConfigForGeometry(
        {
          ...nextConfig,
          initialPreset: currentConfig.initialPreset,
          size: currentConfig.size,
          waveSpeed: currentConfig.waveSpeed,
          domainLength: currentConfig.domainLength,
          initialCenterX: currentConfig.initialCenterX,
          initialCenterY: currentConfig.initialCenterY,
          gaussianWidth: currentConfig.gaussianWidth,
          momentumWidth: currentConfig.momentumWidth,
          modeNumberX: currentConfig.modeNumberX,
          modeNumberY: currentConfig.modeNumberY,
        },
        geometry,
      ),
    );
  }, [geometry]);

  // Builds a fresh time-zero frame locally so a reset or reconfiguration is
  // visible immediately, without waiting a worker round trip that could leave
  // a stale pre-reset frame on screen.
  const publishLocalTimeZeroFrame = useEffectEvent(() => {
    const engine =
      geometryRef.current === 'square-fixed'
        ? new Quantum2DFixedEngine(configRef.current as Quantum2DFixedConfig)
        : new Quantum2DPeriodicEngine(
            configRef.current as Quantum2DPeriodicConfig,
          );
    const freshSnapshot = engine.getDisplaySnapshot(quantityRef.current);
    setSnapshot(freshSnapshot);
    frameChannel.publish(freshSnapshot);
    setDiagnostics(engine.getDiagnostics());
  });

  const fallbackToLocalMode = useEffectEvent(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    schedulerRef.current = null;
    previousWorkerSnapshotRef.current = null;
    setExecutionMode('local');
    localEngineRef.current =
      geometryRef.current === 'square-fixed'
        ? new Quantum2DFixedEngine(configRef.current as Quantum2DFixedConfig)
        : new Quantum2DPeriodicEngine(
            configRef.current as Quantum2DPeriodicConfig,
          );
    localEngineRef.current.setTime(desiredTimeRef.current);
    const freshSnapshot = localEngineRef.current.getDisplaySnapshot(
      quantityRef.current,
    );
    setSnapshot(freshSnapshot);
    frameChannel.publish(freshSnapshot);
    setDiagnostics(localEngineRef.current.getDiagnostics());
  });

  const handleWorkerState = useEffectEvent(
    (response: Extract<Quantum2DWorkerResponse, { type: 'state' }>) => {
      const scheduler = schedulerRef.current;
      if (scheduler === null || !scheduler.isCurrent(response.generation)) {
        return;
      }

      // Publish first (the renderer consumes it synchronously), then hand the
      // superseded frame's buffers back BEFORE the scheduler dispatches the
      // next request, so the worker steadily reuses them instead of
      // allocating.
      const previous = previousWorkerSnapshotRef.current;
      previousWorkerSnapshotRef.current = response.snapshot;
      frameChannel.publish(response.snapshot);

      const recycled: ArrayBufferLike[] = [];
      if (previous !== null) {
        recycled.push(previous.displayValues.buffer);
        if (previous.displayValuesAux !== undefined) {
          recycled.push(previous.displayValuesAux.buffer);
        }
      }
      scheduler.handleResponse(response, recycled);

      const nowMs = performance.now();
      replyCountRef.current += 1;
      if (lastReplyWallMsRef.current > 0) {
        rateTrackerRef.current.addFrame(
          (nowMs - lastReplyWallMsRef.current) / 1000,
          response.snapshot.time - lastReplySimTimeRef.current,
        );
      }
      lastReplyWallMsRef.current = nowMs;
      lastReplySimTimeRef.current = response.snapshot.time;

      if (
        forceNextStateUpdateRef.current ||
        nowMs - lastDiagnosticsWallMsRef.current >=
          DIAGNOSTICS_UPDATE_INTERVAL_SECONDS * 1000
      ) {
        forceNextStateUpdateRef.current = false;
        const windowMs = nowMs - lastDiagnosticsWallMsRef.current;
        const updatesPerSecond =
          windowMs > 0 && windowMs < 10_000
            ? (replyCountRef.current * 1000) / windowMs
            : null;
        replyCountRef.current = 0;
        lastDiagnosticsWallMsRef.current = nowMs;
        // Note: React only keeps this snapshot for low-frequency UI reads of
        // scalar fields; its displayValues buffer may be recycled later. The
        // canvas always renders from the frame channel's latest snapshot.
        setSnapshot(response.snapshot);
        setDiagnostics(response.diagnostics);
        setDisplayTime(response.snapshot.time);
        setAchievedSpeedRatio(rateTrackerRef.current.sampleAndReset());
        setFieldStats({
          updatesPerSecond,
          lagSeconds: Math.max(
            0,
            desiredTimeRef.current - response.snapshot.time,
          ),
          computeMs: response.timings.computeMs,
          snapshotMs: response.timings.snapshotMs,
        });
      }
    },
  );

  // Worker lifecycle: created once per execution mode. Configuration changes
  // are sent as messages (below) instead of tearing the worker down, so a
  // slider drag costs one `configure` rather than a full worker restart.
  useEffect(() => {
    if (executionMode !== 'worker') {
      return undefined;
    }

    let disposed = false;

    try {
      const worker = new Worker(
        new URL('../workers/quantum2D.worker.ts', import.meta.url),
        {
          type: 'module',
        },
      );
      workerRef.current = worker;
      schedulerRef.current = new Quantum2DWorkerScheduler(worker);

      worker.onmessage = (event: MessageEvent<Quantum2DWorkerResponse>) => {
        if (disposed) {
          return;
        }

        if (event.data.type === 'error') {
          // A stale error from a pre-reset generation must not tear down the
          // (healthy) worker for the current configuration.
          if (schedulerRef.current?.isCurrent(event.data.generation) === true) {
            fallbackToLocalMode();
          }
          return;
        }

        handleWorkerState(event.data);
      };

      worker.onerror = () => {
        if (!disposed) {
          fallbackToLocalMode();
        }
      };
    } catch {
      fallbackToLocalMode();
    }

    return () => {
      disposed = true;
      workerRef.current?.terminate();
      workerRef.current = null;
      schedulerRef.current = null;
      previousWorkerSnapshotRef.current = null;
    };
    // fallbackToLocalMode / handleWorkerState are effect events; per the React
    // rules they must NOT be dependencies. Listing them made this effect
    // tear down and reconfigure the worker on EVERY render, which reset the
    // simulation ~50 times a second and froze 2D quantum playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionMode]);

  // (Re)configure the existing worker whenever the physical setup changes.
  // configure() bumps the generation, so stale in-flight results are dropped.
  useEffect(() => {
    if (executionMode !== 'worker') {
      return;
    }

    const scheduler = schedulerRef.current;
    if (scheduler === null) {
      return;
    }

    desiredTimeRef.current = 0;
    previousWorkerSnapshotRef.current = null;
    lastReplyWallMsRef.current = 0;
    lastReplySimTimeRef.current = 0;
    replyCountRef.current = 0;
    rateTrackerRef.current.reset();
    forceNextStateUpdateRef.current = true;
    lastSentQuantityRef.current = quantityRef.current;
    scheduler.configure(geometry, config, quantityRef.current);
    // Publish a fresh local time-zero frame right away: the canvas must not
    // keep showing pre-reconfiguration physics while the worker catches up.
    publishLocalTimeZeroFrame();
    setDisplayTime(0);
    setAchievedSpeedRatio(null);
    setFieldStats(null);
    // publishLocalTimeZeroFrame is an effect event and must not be a
    // dependency (it would retrigger this effect on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, executionMode, geometry]);

  useEffect(() => {
    if (executionMode === 'worker') {
      return;
    }

    localEngineRef.current =
      geometry === 'square-fixed'
        ? new Quantum2DFixedEngine(config as Quantum2DFixedConfig)
        : new Quantum2DPeriodicEngine(config as Quantum2DPeriodicConfig);
    desiredTimeRef.current = 0;
    const freshSnapshot = localEngineRef.current.getDisplaySnapshot(
      quantityRef.current,
    );
    setSnapshot(freshSnapshot);
    frameChannel.publish(freshSnapshot);
    setDiagnostics(localEngineRef.current.getDiagnostics());
    setDisplayTime(0);
  }, [config, executionMode, geometry, frameChannel]);

  useEffect(() => {
    if (executionMode === 'worker') {
      // Skip the redundant round trip when the quantity already matches what
      // the last configure carried (e.g. on mount).
      if (
        schedulerRef.current !== null &&
        lastSentQuantityRef.current !== quantity
      ) {
        lastSentQuantityRef.current = quantity;
        forceNextStateUpdateRef.current = true;
        schedulerRef.current.setQuantity(quantity);
      }
      return;
    }

    const freshSnapshot = localEngineRef.current.getDisplaySnapshot(quantity);
    setSnapshot(freshSnapshot);
    frameChannel.publish(freshSnapshot);
    setDiagnostics(localEngineRef.current.getDiagnostics());
  }, [executionMode, quantity, frameChannel]);

  // A resume must not fold the paused wall time into the achieved-speed
  // window (it would flash a false slow-playback warning).
  useEffect(() => {
    if (playing) {
      lastReplyWallMsRef.current = 0;
      rateTrackerRef.current.reset();
    }
  }, [playing]);

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
        desiredTimeRef.current += elapsedSeconds * speed;

        if (executionMode === 'worker') {
          // Backpressure lives in the scheduler: at most one calculation in
          // flight, and only the newest target time is remembered.
          schedulerRef.current?.requestTime(desiredTimeRef.current);
        } else {
          localEngineRef.current.setTime(desiredTimeRef.current);
          const cellCount = configRef.current.size * configRef.current.size;
          if (
            localDisplayBuffersRef.current === null ||
            localDisplayBuffersRef.current[0].length !== cellCount
          ) {
            localDisplayBuffersRef.current = [
              new Float32Array(cellCount),
              new Float32Array(cellCount),
            ];
          }
          localDisplayParityRef.current = 1 - localDisplayParityRef.current;
          frameChannel.publish(
            localEngineRef.current.getDisplaySnapshot(
              quantityRef.current,
              localDisplayBuffersRef.current[localDisplayParityRef.current],
            ),
          );
          rateTrackerRef.current.addFrame(
            elapsedSeconds,
            elapsedSeconds * speed,
          );

          diagnosticsElapsed += elapsedSeconds;
          if (diagnosticsElapsed >= DIAGNOSTICS_UPDATE_INTERVAL_SECONDS) {
            diagnosticsElapsed = 0;
            setDiagnostics(localEngineRef.current.getDiagnostics());
            setDisplayTime(desiredTimeRef.current);
            setAchievedSpeedRatio(rateTrackerRef.current.sampleAndReset());
          }
        }
      }

      frameId = window.requestAnimationFrame(renderFrame);
    };

    frameId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, [active, executionMode, playing, speed, frameChannel]);

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
    fieldStats,
    setConfig,
    setQuantity,
    setPlaying,
    setSpeed,
    setShowLattice,
    reset: () => {
      desiredTimeRef.current = 0;
      rateTrackerRef.current.reset();
      lastReplyWallMsRef.current = 0;
      lastReplySimTimeRef.current = 0;
      replyCountRef.current = 0;
      setFieldStats(null);

      if (executionMode === 'worker' && schedulerRef.current !== null) {
        // configure() bumps the generation, invalidating pending work; the
        // local time-zero frame below makes the reset visible immediately, so
        // no stale worker frame can sit on screen during the round trip.
        previousWorkerSnapshotRef.current = null;
        forceNextStateUpdateRef.current = true;
        lastSentQuantityRef.current = quantityRef.current;
        schedulerRef.current.configure(geometry, config, quantityRef.current);
        publishLocalTimeZeroFrame();
        setDisplayTime(0);
        setAchievedSpeedRatio(null);
        return;
      }

      localEngineRef.current =
        geometry === 'square-fixed'
          ? new Quantum2DFixedEngine(config as Quantum2DFixedConfig)
          : new Quantum2DPeriodicEngine(config as Quantum2DPeriodicConfig);
      const freshSnapshot = localEngineRef.current.getDisplaySnapshot(quantity);
      setSnapshot(freshSnapshot);
      frameChannel.publish(freshSnapshot);
      setDiagnostics(localEngineRef.current.getDiagnostics());
      setDisplayTime(0);
      setAchievedSpeedRatio(null);
    },
    stepOnce: () => {
      // Explicit single step: one phase-sampling interval (recommendedDt).
      const nextDt = diagnosticsRef.current.recommendedDt;
      desiredTimeRef.current += nextDt;

      if (executionMode === 'worker' && schedulerRef.current !== null) {
        schedulerRef.current.requestTime(desiredTimeRef.current);
        return;
      }

      localEngineRef.current.setTime(desiredTimeRef.current);
      const freshSnapshot = localEngineRef.current.getDisplaySnapshot(quantity);
      setSnapshot(freshSnapshot);
      frameChannel.publish(freshSnapshot);
      setDiagnostics(localEngineRef.current.getDiagnostics());
      setDisplayTime(desiredTimeRef.current);
    },
  };
}

function getDefaultConfig(geometry: Quantum2DGeometry): Quantum2DConfig {
  return geometry === 'square-fixed'
    ? defaultQuantum2DSquareConfig
    : defaultQuantum2DTorusConfig;
}

/**
 * Adjusts a config carried across a geometry switch so it stays valid for the
 * destination topology: the split preset does not exist on the fixed square,
 * square normal modes need components in 1 .. size-2, and a periodic split
 * needs a distinct +kx branch.
 */
function sanitizeConfigForGeometry(
  config: Quantum2DConfig,
  geometry: Quantum2DGeometry,
): Quantum2DConfig {
  const periodic = geometry === 'torus-periodic';
  let initialPreset = config.initialPreset;

  if (!periodic && initialPreset === 'split-superposition') {
    initialPreset = 'selected-normal-mode';
  }

  const minimumMode =
    !periodic && initialPreset === 'selected-normal-mode' ? 1 : 0;
  const maximumMode = periodic ? config.size - 1 : config.size - 2;
  let modeNumberX = Math.min(
    Math.max(config.modeNumberX, minimumMode),
    maximumMode,
  );
  const modeNumberY = Math.min(
    Math.max(config.modeNumberY, minimumMode),
    maximumMode,
  );

  if (
    periodic &&
    initialPreset === 'split-superposition' &&
    (modeNumberX === 0 ||
      (config.size % 2 === 0 && modeNumberX === config.size / 2))
  ) {
    modeNumberX = 1;
  }

  return { ...config, initialPreset, modeNumberX, modeNumberY };
}
