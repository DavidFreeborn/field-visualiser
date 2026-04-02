import { useEffect, useRef } from 'react';
import type {
  Classical1DPeriodicQuantity,
  Classical1DPeriodicSnapshot,
} from '../../physics/classical/classical1dPeriodic';
import {
  PeriodicClassicalFieldRenderer,
  type PeriodicClassicalFieldRendererOptions,
} from '../../rendering/pixi/PeriodicClassicalFieldRenderer';

interface PrototypeCanvasProps {
  readonly snapshot: Classical1DPeriodicSnapshot;
  readonly quantity: Classical1DPeriodicQuantity;
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
          Displaying the periodic chain in an unwrapped view. Signed quantities
          use a restrained blue-white-red map; energy density uses a red
          sequential map.
        </p>
      </div>
    </section>
  );
}
