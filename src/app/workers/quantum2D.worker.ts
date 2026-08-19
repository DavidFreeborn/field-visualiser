/// <reference lib="webworker" />
import {
  Quantum2DFixedEngine,
  type Quantum2DFixedConfig,
} from '../../physics/quantum/quantum2dFixed';
import {
  Quantum2DPeriodicEngine,
  type Quantum2DPeriodicConfig,
} from '../../physics/quantum/quantum2dPeriodic';
import type {
  Quantum2DConfig,
  Quantum2DGeometry,
  Quantum2DQuantity,
  Quantum2DWorkerRequest,
  Quantum2DWorkerResponse,
} from './quantum2DProtocol';

type WorkerEngine = Quantum2DFixedEngine | Quantum2DPeriodicEngine;

let engine: WorkerEngine | null = null;
let quantity: Quantum2DQuantity = 'probability-density';
let generation = 0;
let recycledBuffers: ArrayBuffer[] = [];

self.onmessage = (event: MessageEvent<Quantum2DWorkerRequest>): void => {
  try {
    handleMessage(event.data);
  } catch (error) {
    postMessage({
      type: 'error',
      generation,
      message: error instanceof Error ? error.message : 'Unknown quantum worker error.',
    } satisfies Quantum2DWorkerResponse);
  }
};

function handleMessage(message: Quantum2DWorkerRequest): void {
  // postMessage ordering guarantees mean the latest generation always arrives
  // last, so simply adopting the incoming generation is safe.
  generation = message.generation;

  switch (message.type) {
    case 'configure':
      engine = createEngine(message.geometry, message.config);
      quantity = message.quantity;
      recycledBuffers = [];
      postCurrentState(0);
      return;
    case 'set-quantity':
      ensureEngine();
      quantity = message.quantity;
      postCurrentState(0);
      return;
    case 'set-time': {
      const configuredEngine = ensureEngine();
      if (message.recycledBuffers !== undefined) {
        recycledBuffers = recycledBuffers.concat(message.recycledBuffers).slice(-2);
      }
      const computeStart = performance.now();
      configuredEngine.setTime(message.targetTime);
      postCurrentState(performance.now() - computeStart);
      return;
    }
  }
}

function createEngine(geometry: Quantum2DGeometry, config: Quantum2DConfig): WorkerEngine {
  return geometry === 'square-fixed'
    ? new Quantum2DFixedEngine(config as Quantum2DFixedConfig)
    : new Quantum2DPeriodicEngine(config as Quantum2DPeriodicConfig);
}

function takeRecycledTarget(): Float32Array | undefined {
  const buffer = recycledBuffers.pop();
  return buffer !== undefined && buffer.byteLength > 0 ? new Float32Array(buffer) : undefined;
}

function postCurrentState(computeMs: number): void {
  const activeEngine = ensureEngine();
  const snapshotStart = performance.now();
  // Only the phase view consumes an auxiliary buffer; popping one for other
  // quantities would silently drop it from the recycling pool.
  const auxTarget = quantity === 'phase-magnitude' ? takeRecycledTarget() : undefined;
  const snapshot = activeEngine.getDisplaySnapshot(quantity, takeRecycledTarget(), auxTarget);
  const snapshotMs = performance.now() - snapshotStart;

  const transfer: Transferable[] = [snapshot.displayValues.buffer as ArrayBuffer];
  if (snapshot.displayValuesAux !== undefined) {
    transfer.push(snapshot.displayValuesAux.buffer as ArrayBuffer);
  }
  postMessage(
    {
      type: 'state',
      generation,
      snapshot,
      diagnostics: activeEngine.getDiagnostics(),
      timings: { computeMs, snapshotMs },
    } satisfies Quantum2DWorkerResponse,
    transfer,
  );
}

function ensureEngine(): WorkerEngine {
  if (engine === null) {
    throw new Error('Quantum 2D worker has not been configured.');
  }

  return engine;
}
