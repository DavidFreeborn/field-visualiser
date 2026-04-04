import type {
  Quantum2DFixedConfig,
  Quantum2DFixedDiagnostics,
  Quantum2DFixedQuantity,
} from '../../physics/quantum/quantum2dFixed';
import type {
  Quantum2DPeriodicConfig,
  Quantum2DPeriodicDiagnostics,
  Quantum2DPeriodicQuantity,
} from '../../physics/quantum/quantum2dPeriodic';
import type { Quantum2DDisplaySnapshot } from '../../physics/quantum/quantum2dDisplay';

export type Quantum2DGeometry = 'square-fixed' | 'torus-periodic';
export type Quantum2DConfig = Quantum2DFixedConfig | Quantum2DPeriodicConfig;
export type Quantum2DQuantity = Quantum2DFixedQuantity | Quantum2DPeriodicQuantity;
export type Quantum2DSnapshot = Quantum2DDisplaySnapshot;
export type Quantum2DDiagnostics = Quantum2DFixedDiagnostics | Quantum2DPeriodicDiagnostics;

export type Quantum2DWorkerRequest =
  | {
      readonly type: 'configure';
      readonly geometry: Quantum2DGeometry;
      readonly config: Quantum2DConfig;
      readonly quantity: Quantum2DQuantity;
    }
  | {
      readonly type: 'set-quantity';
      readonly quantity: Quantum2DQuantity;
    }
  | {
      readonly type: 'advance';
      readonly elapsedSeconds: number;
      readonly speed: number;
    }
  | {
      readonly type: 'step-once';
    };

export type Quantum2DWorkerResponse =
  | {
      readonly type: 'state';
      readonly snapshot: Quantum2DSnapshot;
      readonly diagnostics: Quantum2DDiagnostics;
    }
  | {
      readonly type: 'error';
      readonly message: string;
    };
