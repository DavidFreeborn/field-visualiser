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
let simulatedTime = 0;

self.onmessage = (event: MessageEvent<Quantum2DWorkerRequest>): void => {
  try {
    handleMessage(event.data);
  } catch (error) {
    postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown quantum worker error.',
    } satisfies Quantum2DWorkerResponse);
  }
};

function handleMessage(message: Quantum2DWorkerRequest): void {
  switch (message.type) {
    case 'configure':
      engine = createEngine(message.geometry, message.config);
      quantity = message.quantity;
      simulatedTime = 0;
      postCurrentState();
      return;
    case 'set-quantity':
      ensureEngine();
      quantity = message.quantity;
      postCurrentState();
      return;
    case 'advance': {
      const configuredEngine = ensureEngine();
      simulatedTime += message.elapsedSeconds * message.speed;
      configuredEngine.setTime(simulatedTime);
      return;
    }
    case 'sync-state':
      ensureEngine();
      postCurrentState();
      return;
    case 'step-once': {
      const stepEngine = ensureEngine();
      stepEngine.step(stepEngine.getDiagnostics().recommendedDt);
      simulatedTime += stepEngine.getDiagnostics().recommendedDt;
      postCurrentState();
      return;
    }
  }
}

function createEngine(geometry: Quantum2DGeometry, config: Quantum2DConfig): WorkerEngine {
  return geometry === 'square-fixed'
    ? new Quantum2DFixedEngine(config as Quantum2DFixedConfig)
    : new Quantum2DPeriodicEngine(config as Quantum2DPeriodicConfig);
}

function postCurrentState(): void {
  const activeEngine = ensureEngine();
  const snapshot = activeEngine.getDisplaySnapshot(quantity);
  postMessage({
    type: 'state',
    snapshot,
    diagnostics: activeEngine.getDiagnostics(),
  } satisfies Quantum2DWorkerResponse, [snapshot.displayValues.buffer]);
}

function ensureEngine(): WorkerEngine {
  if (engine === null) {
    throw new Error('Quantum 2D worker has not been configured.');
  }

  return engine;
}
