import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Classical1DPeriodicQuantity,
  Classical1DPeriodicSnapshot,
} from '../../physics/classical/classical1dPeriodic';
import type {
  Quantum1DPeriodicQuantity,
  Quantum1DPeriodicSnapshot,
} from '../../physics/quantum/quantum1dPeriodic';
import type {
  Quantum1DFixedQuantity,
  Quantum1DFixedSnapshot,
} from '../../physics/quantum/quantum1dFixed';
import type {
  Quantum2DPeriodicQuantity,
} from '../../physics/quantum/quantum2dPeriodic';
import type {
  Quantum2DFixedQuantity,
} from '../../physics/quantum/quantum2dFixed';
import type { Quantum2DDisplaySnapshot } from '../../physics/quantum/quantum2dDisplay';
import type { Classical1DFixedQuantity, Classical1DFixedSnapshot } from '../../physics/classical/classical1dFixed';
import type { Classical2DQuantity, Classical2DSnapshot } from '../../physics/classical/classical2d';
import type { PeriodicClassicalFieldRendererOptions } from '../../rendering/pixi/PeriodicClassicalFieldRenderer';

interface PrototypeCanvasProps {
  readonly snapshot:
    | Classical1DPeriodicSnapshot
    | Classical1DFixedSnapshot
    | Classical2DSnapshot
    | Quantum1DPeriodicSnapshot
    | Quantum1DFixedSnapshot
    | Quantum2DDisplaySnapshot;
  readonly quantity:
    | Classical1DPeriodicQuantity
    | Classical1DFixedQuantity
    | Classical2DQuantity
    | Quantum1DPeriodicQuantity
    | Quantum1DFixedQuantity
    | Quantum2DPeriodicQuantity
    | Quantum2DFixedQuantity;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly circleLayout?: 'radial' | 'longitudinal';
}

export function PrototypeCanvas({
  snapshot,
  quantity,
  showLattice,
  showSprings,
  circleLayout = 'radial',
}: PrototypeCanvasProps): React.JSX.Element {
  const [rendererStatus, setRendererStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryNonce, setRetryNonce] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<RendererInstance | null>(null);
  const snapshotRef = useRef(snapshot);
  const optionsRef = useRef<PeriodicClassicalFieldRendererOptions>({
    showLattice,
    showSprings,
    quantity,
    circleLayout,
  });
  snapshotRef.current = snapshot;
  optionsRef.current = {
    showLattice,
    showSprings,
    quantity,
    circleLayout,
  };

  useEffect(() => {
    let disposed = false;
    setRendererStatus('loading');

    const host = hostRef.current;

    if (host === null) {
      return undefined;
    }
    host.replaceChildren();

    void loadRendererModule().then(({ PeriodicClassicalFieldRenderer }) => {
      if (disposed) {
        return;
      }

      const renderer = new PeriodicClassicalFieldRenderer(host);
      rendererRef.current = renderer;

      void renderer.init().then(() => {
        if (disposed) {
          renderer.destroy();
          return;
        }

        setRendererStatus('ready');
        renderer.render(snapshotRef.current, optionsRef.current);
      }).catch(() => {
        if (disposed) {
          return;
        }

        renderer.destroy();
        rendererRef.current = null;
        setRendererStatus('error');
      });
    }).catch(() => {
      if (disposed) {
        return;
      }

      rendererModulePromise = null;
      setRendererStatus('error');
    });

    return () => {
      disposed = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      host.replaceChildren();
    };
  }, [retryNonce]);

  useEffect(() => {
    const renderer = rendererRef.current;

    if (renderer === null) {
      return;
    }

    renderer.render(snapshot, optionsRef.current);
  }, [circleLayout, quantity, showLattice, showSprings, snapshot]);

  const visualGuide = useMemo(() => getVisualGuide(quantity), [quantity]);

  return (
    <section className="visual-panel">
      <div className="visual-canvas-shell">
        <div
          aria-label="Field visualisation canvas"
          className="visual-canvas"
          ref={hostRef}
          role="img"
        />
        {rendererStatus !== 'ready' ? (
          <div
            aria-live="polite"
            className="visual-loading"
            role="status"
          >
            {rendererStatus === 'loading'
              ? 'Loading renderer'
              : 'Renderer failed to load'}
            {rendererStatus === 'error' ? (
              <button
                className="secondary-button visual-retry"
                type="button"
                onClick={() => setRetryNonce((current) => current + 1)}
              >
                Retry renderer
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="visual-caption-stack">
        <p className="visual-boundary-caption">{getBoundaryLabel(snapshot)}</p>
        <p className="visual-caption">{visualGuide.summary}</p>
        <div className="legend-row">
          <span className="legend-label">{visualGuide.legendLabelLeft}</span>
          <div
            aria-hidden="true"
            className={`legend-bar ${visualGuide.legendVariant}`}
          />
          <span className="legend-label">{visualGuide.legendLabelRight}</span>
        </div>
      </div>
    </section>
  );
}

type RendererModule = typeof import('../../rendering/pixi/PeriodicClassicalFieldRenderer');
type RendererInstance = InstanceType<RendererModule['PeriodicClassicalFieldRenderer']>;

let rendererModulePromise: Promise<RendererModule> | null = null;

function loadRendererModule(): Promise<RendererModule> {
  rendererModulePromise ??= import('../../rendering/pixi/PeriodicClassicalFieldRenderer');
  return rendererModulePromise;
}

function getVisualGuide(quantity: PrototypeCanvasProps['quantity']): {
  summary: string;
  legendVariant: 'legend-sequential' | 'legend-diverging';
  legendLabelLeft: string;
  legendLabelRight: string;
} {
  return {
    summary: getQuantityLabel(quantity),
    legendVariant: isUnsignedQuantity(quantity) ? 'legend-sequential' : 'legend-diverging',
    legendLabelLeft: isUnsignedQuantity(quantity) ? '0' : '-1',
    legendLabelRight: isUnsignedQuantity(quantity) ? '1' : '+1',
  };
}

function getQuantityLabel(quantity: PrototypeCanvasProps['quantity']): string {
  switch (quantity) {
    case 'displacement':
      return 'Displacement';
    case 'velocity':
      return 'Velocity';
    case 'energy-density':
      return 'Energy density';
    case 'probability-density':
      return 'Probability density';
    case 'magnitude':
      return 'Magnitude';
    case 'real-part':
      return 'Real part';
    case 'imaginary-part':
      return 'Imaginary part';
  }
}

function isUnsignedQuantity(quantity: PrototypeCanvasProps['quantity']): boolean {
  return quantity === 'energy-density' || quantity === 'probability-density' || quantity === 'magnitude';
}

function getBoundaryLabel(snapshot: PrototypeCanvasProps['snapshot']): string {
  switch (snapshot.boundaryCondition) {
    case 'dirichlet':
      return 'Dirichlet boundary conditions';
    case 'periodic':
      return 'Periodic boundary conditions';
  }
}
