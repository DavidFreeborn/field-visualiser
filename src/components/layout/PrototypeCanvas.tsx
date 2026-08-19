import { useEffect, useRef, useState } from 'react';
import type {
  Classical1DPeriodicSnapshot,
} from '../../physics/classical/classical1dPeriodic';
import type {
  Quantum1DPeriodicSnapshot,
} from '../../physics/quantum/quantum1dPeriodic';
import type {
  Quantum1DFixedSnapshot,
} from '../../physics/quantum/quantum1dFixed';
import type { Quantum2DDisplaySnapshot } from '../../physics/quantum/quantum2dDisplay';
import type { Classical1DFixedSnapshot } from '../../physics/classical/classical1dFixed';
import type { Classical2DSnapshot } from '../../physics/classical/classical2d';
import type {
  PeriodicClassicalFieldRendererOptions,
  RendererQuantity,
  RenderFrameInfo,
} from '../../rendering/pixi/PeriodicClassicalFieldRenderer';
import {
  getDivergingCssGradient,
  getPhaseWheelCssGradient,
  getSequentialCssGradient,
} from '../../rendering/colorMaps';
import type { FrameChannel } from '../../app/state/frameChannel';

type CanvasSnapshot =
  | Classical1DPeriodicSnapshot
  | Classical1DFixedSnapshot
  | Classical2DSnapshot
  | Quantum1DPeriodicSnapshot
  | Quantum1DFixedSnapshot
  | Quantum2DDisplaySnapshot;

/** Compact diagnostics shown inside the empty centre of the ring views. */
export interface RingCenterInfo {
  readonly time: number;
  readonly resolutionLabel: string;
  readonly conservationLabel: string;
  readonly conservationValue: string;
  readonly requestedSpeed: number;
  readonly achievedSpeedRatio: number | null;
}

interface PrototypeCanvasProps {
  readonly snapshot: CanvasSnapshot;
  /**
   * High-frequency frame source. When provided, per-frame snapshots arrive
   * imperatively through this channel instead of via React re-renders; the
   * `snapshot` prop is only used as the initial/discrete-event fallback.
   */
  readonly frameChannel?: FrameChannel<CanvasSnapshot>;
  readonly quantity: RendererQuantity;
  readonly showLattice: boolean;
  readonly showSprings: boolean;
  readonly circleLayout?: 'radial' | 'longitudinal';
  readonly circleGeometryMode?: 'deformed' | 'fixed';
  readonly oneDView?: 'plot' | 'ring';
  readonly scaleMode?: 'fixed' | 'normalize';
  /** Diagnostics for the centre of the ring views. */
  readonly centerInfo?: RingCenterInfo;
  /** Optional explanatory note (e.g. stationary-state explanation). */
  readonly infoNote?: string;
}

export function PrototypeCanvas({
  snapshot,
  frameChannel,
  quantity,
  showLattice,
  showSprings,
  circleLayout = 'radial',
  circleGeometryMode = 'deformed',
  // The circle is the primary representation for periodic 1D systems.
  oneDView = 'ring',
  scaleMode,
  centerInfo,
  infoNote,
}: PrototypeCanvasProps): React.JSX.Element {
  const [rendererStatus, setRendererStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryNonce, setRetryNonce] = useState(0);
  const [frameInfo, setFrameInfo] = useState<RenderFrameInfo | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<RendererInstance | null>(null);
  const snapshotRef = useRef(snapshot);
  const frameChannelRef = useRef(frameChannel);
  frameChannelRef.current = frameChannel;
  const frameInfoRef = useRef<RenderFrameInfo | null>(null);
  const optionsRef = useRef<PeriodicClassicalFieldRendererOptions>({
    showLattice,
    showSprings,
    quantity,
    circleLayout,
    circleGeometryMode,
    oneDView,
    ...(scaleMode !== undefined ? { scaleMode } : {}),
  });
  snapshotRef.current = snapshot;
  optionsRef.current = {
    showLattice,
    showSprings,
    quantity,
    circleLayout,
    circleGeometryMode,
    oneDView,
    ...(scaleMode !== undefined ? { scaleMode } : {}),
  };

  // Renders a frame and publishes the mapping actually used to the legend,
  // updating React state only when the mapping changes visibly.
  const renderFrame = (frameSnapshot: CanvasSnapshot): void => {
    const info = rendererRef.current?.render(frameSnapshot, optionsRef.current) ?? null;

    if (info === null) {
      return;
    }

    const previous = frameInfoRef.current;
    if (
      previous === null ||
      previous.scaleMode !== info.scaleMode ||
      previous.signed !== info.signed ||
      previous.phase !== info.phase ||
      formatScale(previous.scaleMax) !== formatScale(info.scaleMax)
    ) {
      frameInfoRef.current = info;
      setFrameInfo(info);
    }
  };
  const renderFrameRef = useRef(renderFrame);
  renderFrameRef.current = renderFrame;

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
        renderFrameRef.current(frameChannelRef.current?.getLatest() ?? snapshotRef.current);
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
    if (rendererRef.current === null) {
      return;
    }

    // Prefer the channel's newest frame: the React snapshot prop may be an
    // older frame whose worker display buffer has since been recycled.
    renderFrameRef.current(frameChannel?.getLatest() ?? snapshot);
  }, [
    circleGeometryMode,
    circleLayout,
    frameChannel,
    oneDView,
    quantity,
    scaleMode,
    showLattice,
    showSprings,
    snapshot,
    rendererStatus,
  ]);

  // High-frequency frames bypass React entirely: the channel listener hands
  // each published snapshot straight to the imperative renderer.
  useEffect(() => {
    if (frameChannel === undefined || rendererStatus !== 'ready') {
      return undefined;
    }

    return frameChannel.subscribe((publishedSnapshot) => {
      renderFrameRef.current(publishedSnapshot);
    });
  }, [frameChannel, rendererStatus]);

  const isQuantum =
    snapshot.kind === 'quantum-1d-periodic' ||
    snapshot.kind === 'quantum-1d-fixed' ||
    snapshot.kind === 'quantum-2d-display';
  const legend = buildLegend(quantity, frameInfo, isQuantum);
  const showRingCenter =
    oneDView !== 'plot' &&
    (snapshot.kind === 'classical-1d-periodic' || snapshot.kind === 'quantum-1d-periodic') &&
    rendererStatus === 'ready';

  return (
    <section className="visual-panel">
      <div className="visual-canvas-shell">
        <div
          aria-label="Field visualisation canvas"
          className="visual-canvas"
          ref={hostRef}
          role="img"
        />
        {showRingCenter && centerInfo !== undefined ? (
          // Purely visual duplicate of the status strip below; hidden from
          // the accessibility tree to avoid double announcements.
          <div
            aria-hidden="true"
            className="ring-center-overlay"
          >
            <div className="ring-center-content">
              {legend.phase ? (
                <span
                  aria-hidden="true"
                  className="phase-wheel phase-wheel-center"
                  style={{ background: getPhaseWheelCssGradient() }}
                />
              ) : null}
              {legend.combined ? (
                <p className="ring-center-trace-legend">
                  <span className="trace-swatch trace-swatch-real" /> Re&nbsp;&psi;
                  <span className="trace-swatch trace-swatch-imaginary" /> Im&nbsp;&psi;
                  <br />
                  <span className="ring-center-range">
                    &minus;{legend.maxLabel} to +{legend.maxLabel}
                  </span>
                </p>
              ) : null}
              <dl className="ring-center-grid">
                <div>
                  <dt>t</dt>
                  <dd>{centerInfo.time.toFixed(3)}</dd>
                </div>
                <div>
                  <dt>Sites</dt>
                  <dd>{centerInfo.resolutionLabel}</dd>
                </div>
                <div>
                  <dt>{centerInfo.conservationLabel}</dt>
                  <dd>{centerInfo.conservationValue}</dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd>
                    {centerInfo.requestedSpeed.toFixed(1)}&times;
                    {centerInfo.achievedSpeedRatio !== null
                      ? ` (${centerInfo.achievedSpeedRatio.toFixed(2)}×)`
                      : ''}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}
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
        <p className="visual-caption">{legend.summary}</p>
        {infoNote !== undefined ? (
          <p className="visual-supporting-note">{infoNote}</p>
        ) : null}
        {legend.combined ? (
          <div className="legend-row legend-row-traces">
            <span className="legend-label">
              <span className="trace-swatch trace-swatch-real" /> Re&nbsp;&psi;
            </span>
            <span className="legend-label">
              <span className="trace-swatch trace-swatch-imaginary" /> Im&nbsp;&psi;
            </span>
            <span className="legend-label">
              shared scale &minus;{legend.maxLabel} to +{legend.maxLabel}
            </span>
          </div>
        ) : legend.phase ? (
          <div className="legend-row legend-row-phase">
            <span
              aria-hidden="true"
              className="phase-wheel"
              style={{ background: getPhaseWheelCssGradient() }}
            />
            <span className="legend-label">
              hue = phase arg &psi; (&minus;&pi; to +&pi;), fade = |&psi;| from 0 to{' '}
              {legend.maxLabel}
            </span>
          </div>
        ) : (
          <div className="legend-row">
            <span className="legend-label">{legend.leftLabel}</span>
            <div
              aria-hidden="true"
              className="legend-bar"
              style={{ background: legend.gradient }}
            />
            <span className="legend-label">{legend.rightLabel}</span>
          </div>
        )}
        <p className="legend-scale-note">{legend.scaleNote}</p>
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

function formatScale(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return '0';
  }
  return value.toPrecision(3);
}

function buildLegend(
  quantity: RendererQuantity,
  frameInfo: RenderFrameInfo | null,
  isQuantum: boolean,
): {
  summary: string;
  gradient: string;
  leftLabel: string;
  rightLabel: string;
  scaleNote: string;
  phase: boolean;
  combined: boolean;
  maxLabel: string;
} {
  const signed = !isUnsignedQuantity(quantity) && quantity !== 'phase-magnitude';
  const phase = quantity === 'phase-magnitude';
  const combined = quantity === 'real-imaginary-parts';
  const scaleMax = frameInfo?.scaleMax ?? 1;
  const maxLabel = formatScale(scaleMax);
  const scaleMode = frameInfo?.scaleMode ?? (signed ? 'fixed' : 'normalize');

  return {
    summary: getQuantityLabel(quantity, isQuantum),
    gradient: signed ? getDivergingCssGradient() : getSequentialCssGradient(),
    leftLabel: signed ? `-${maxLabel}` : '0',
    rightLabel: signed ? `+${maxLabel}` : maxLabel,
    scaleNote:
      scaleMode === 'fixed'
        ? 'Fixed scale: the mapping is held constant across frames (auto-grows if exceeded).'
        : 'Normalized each frame: the mapping is rescaled to the current frame extremum.',
    phase,
    combined,
    maxLabel,
  };
}

function getQuantityLabel(quantity: RendererQuantity, isQuantum: boolean): string {
  switch (quantity) {
    case 'displacement':
      return 'Displacement';
    case 'velocity':
      return 'Velocity';
    case 'energy-density':
      return 'Energy density';
    case 'probability-density':
      // The displayed value is |psi_i|^2 per lattice site, which sums to one;
      // it is a site probability, not a continuum density.
      return isQuantum ? 'Site probability |ψᵢ|²' : 'Probability';
    case 'magnitude':
      return 'Magnitude |ψ|';
    case 'real-part':
      return 'Real part';
    case 'imaginary-part':
      return 'Imaginary part';
    case 'phase-magnitude':
      return 'Complex amplitude (hue = phase, fade = magnitude)';
    case 'real-imaginary-parts':
      return 'Re ψ and Im ψ (shared symmetric scale)';
  }
}

function isUnsignedQuantity(quantity: RendererQuantity): boolean {
  return (
    quantity === 'energy-density' ||
    quantity === 'probability-density' ||
    quantity === 'magnitude' ||
    quantity === 'phase-magnitude'
  );
}

function getBoundaryLabel(snapshot: CanvasSnapshot): string {
  switch (snapshot.boundaryCondition) {
    case 'dirichlet':
      return 'Dirichlet boundary conditions';
    case 'periodic':
      return 'Periodic boundary conditions';
  }
}
