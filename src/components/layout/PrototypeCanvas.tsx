import { useEffect, useRef } from 'react';
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
import type { Classical1DFixedQuantity, Classical1DFixedSnapshot } from '../../physics/classical/classical1dFixed';
import {
  PeriodicClassicalFieldRenderer,
  type PeriodicClassicalFieldRendererOptions,
} from '../../rendering/pixi/PeriodicClassicalFieldRenderer';

interface PrototypeCanvasProps {
  readonly snapshot:
    | Classical1DPeriodicSnapshot
    | Classical1DFixedSnapshot
    | Quantum1DPeriodicSnapshot
    | Quantum1DFixedSnapshot;
  readonly quantity:
    | Classical1DPeriodicQuantity
    | Classical1DFixedQuantity
    | Quantum1DPeriodicQuantity
    | Quantum1DFixedQuantity;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
}

export function PrototypeCanvas({
  snapshot,
  quantity,
  showLattice,
  showSprings,
}: PrototypeCanvasProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PeriodicClassicalFieldRenderer | null>(null);
  const snapshotRef = useRef(snapshot);
  const optionsRef = useRef<PeriodicClassicalFieldRendererOptions>({
    showLattice,
    showSprings,
    quantity,
  });

  snapshotRef.current = snapshot;
  optionsRef.current = {
    showLattice,
    showSprings,
    quantity,
  };

  useEffect(() => {
    let disposed = false;

    const host = hostRef.current;

    if (host === null) {
      return undefined;
    }

    const renderer = new PeriodicClassicalFieldRenderer(host);
    rendererRef.current = renderer;

    void renderer.init().then(() => {
      if (disposed) {
        renderer.destroy();
        return;
      }

      renderer.render(snapshotRef.current, optionsRef.current);
    });

    return () => {
      disposed = true;
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;

    if (renderer === null) {
      return;
    }

    renderer.render(snapshot, optionsRef.current);
  }, [quantity, showLattice, showSprings, snapshot]);

  return (
    <section className="visual-panel">
      <div
        aria-label="1D periodic classical field visualisation"
        className="visual-canvas"
        ref={hostRef}
        role="img"
      />
      <div className="visual-caption">
        <p>
          {snapshot.boundaryCondition === 'periodic'
            ? 'This 1D circle is rendered as an unwrapped periodic line: the left and right edges are adjacent lattice sites on the same ring.'
            : 'This 1D interval has fixed-end Dirichlet boundaries: the two endpoint sites remain clamped to zero.'}{' '}
          Signed quantities use a restrained blue-white-red map; probability density and
          other unsigned quantities use a red sequential map.
        </p>
      </div>
    </section>
  );
}
