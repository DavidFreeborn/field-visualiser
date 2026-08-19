import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { PrototypeCanvas } from '../../components/layout/PrototypeCanvas';
import type { Classical1DPeriodicSnapshot } from '../../physics/classical/classical1dPeriodic';
import type { Quantum2DDisplaySnapshot } from '../../physics/quantum/quantum2dDisplay';

const constructorSpy = vi.fn();
const initSpy = vi.fn(() => Promise.resolve());
const renderSpy = vi.fn();
const destroySpy = vi.fn();

vi.mock('../../rendering/pixi/PeriodicClassicalFieldRenderer', () => ({
  PeriodicClassicalFieldRenderer: class {
    private readonly host: HTMLElement;

    private canvas: HTMLCanvasElement | null = null;

    public constructor(host: HTMLElement) {
      constructorSpy(host);
      this.host = host;
    }

    public init(): Promise<void> {
      return initSpy().then(() => {
        this.canvas = document.createElement('canvas');
        this.canvas.dataset.testid = 'mock-renderer-canvas';
        this.host.appendChild(this.canvas);
      });
    }

    public render(
      snapshot: Classical1DPeriodicSnapshot | Quantum2DDisplaySnapshot,
      options: {
        quantity: string;
        showLattice: boolean;
        showSprings: boolean;
        circleLayout?: 'radial' | 'longitudinal';
        circleGeometryMode?: 'deformed' | 'fixed';
      },
    ): void {
      renderSpy(snapshot, options);
    }

    public destroy(): void {
      this.canvas?.remove();
      this.canvas = null;
      destroySpy();
    }
  },
}));

const snapshot: Classical1DPeriodicSnapshot = {
  kind: 'classical-1d-periodic',
  time: 0,
  systemLabel: '1D circle',
  boundaryCondition: 'periodic',
  modeLabel: 'classical field',
  quantity: 'displacement',
  siteCount: 8,
  domainLength: 1,
  spacing: 1 / 8,
  displacement: new Float64Array(8),
  velocity: new Float64Array(8),
  localEnergyDensity: new Float64Array(8),
  totalEnergy: 0,
  kineticEnergy: 0,
  potentialEnergy: 0,
};

describe('PrototypeCanvas', () => {
  it('shows a loading state until the lazy renderer is ready', async () => {
    constructorSpy.mockClear();
    renderSpy.mockClear();
    initSpy.mockClear();
    destroySpy.mockClear();

    let resolveInit: (() => void) | undefined;
    initSpy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        }),
    );

    render(
      <PrototypeCanvas
        quantity="displacement"
        showLattice
        showSprings
        snapshot={snapshot}
      />,
    );

    await waitFor(() => {
      expect(initSpy).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/loading renderer/i);

    resolveInit?.();

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalled();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('renders the first frame after renderer initialization', async () => {
    constructorSpy.mockClear();
    renderSpy.mockClear();
    initSpy.mockClear();

    render(
      <PrototypeCanvas
        quantity="displacement"
        showLattice
        showSprings
        snapshot={snapshot}
      />,
    );

    await waitFor(() => {
      expect(constructorSpy).toHaveBeenCalledTimes(1);
      expect(initSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy).toHaveBeenCalled();
    });
  });

  it('reuses the existing renderer on ordinary snapshot updates', async () => {
    constructorSpy.mockClear();
    renderSpy.mockClear();
    initSpy.mockClear();
    destroySpy.mockClear();

    const { rerender } = render(
      <PrototypeCanvas
        quantity="displacement"
        showLattice
        showSprings
        snapshot={snapshot}
      />,
    );

    await waitFor(() => {
      expect(constructorSpy).toHaveBeenCalledTimes(1);
      expect(initSpy).toHaveBeenCalledTimes(1);
    });

    const nextSnapshot: Classical1DPeriodicSnapshot = {
      ...snapshot,
      time: 0.1,
      displacement: new Float64Array([1, 0, 0, 0, 0, 0, 0, 0]),
    };

    rerender(
      <PrototypeCanvas
        quantity="velocity"
        showLattice={false}
        showSprings
        snapshot={nextSnapshot}
      />,
    );

    await waitFor(() => {
      expect(renderSpy).toHaveBeenLastCalledWith(nextSnapshot, {
        circleGeometryMode: 'deformed',
        circleLayout: 'radial',
        oneDView: 'ring',
        quantity: 'velocity',
        showLattice: false,
        showSprings: true,
      });
    });

    expect(constructorSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(destroySpy).not.toHaveBeenCalled();
  });

  it('reuses the renderer for 2D quantum snapshot updates', async () => {
    constructorSpy.mockClear();
    renderSpy.mockClear();
    initSpy.mockClear();
    destroySpy.mockClear();

    const quantumSnapshot: Quantum2DDisplaySnapshot = {
      kind: 'quantum-2d-display',
      sourceKind: 'quantum-2d-periodic',
      time: 0,
      systemLabel: '2D torus',
      boundaryCondition: 'periodic',
      modeLabel: 'free-field one-particle',
      quantity: 'probability-density',
      width: 4,
      height: 4,
      domainLength: 1,
      spacing: 0.25,
      geometry: 'torus-periodic',
      displayValues: new Float32Array(16),
      totalNorm: 1,
    };

    const { rerender } = render(
      <PrototypeCanvas
        quantity="probability-density"
        showLattice={false}
        showSprings={false}
        snapshot={quantumSnapshot}
      />,
    );

    await waitFor(() => {
      expect(constructorSpy).toHaveBeenCalledTimes(1);
      expect(initSpy).toHaveBeenCalledTimes(1);
    });

    const nextSnapshot: Quantum2DDisplaySnapshot = {
      ...quantumSnapshot,
      time: 0.1,
      quantity: 'magnitude',
      displayValues: Float32Array.from({ length: 16 }, (_, index) => index / 16),
    };

    rerender(
      <PrototypeCanvas
        quantity="magnitude"
        showLattice
        showSprings={false}
        snapshot={nextSnapshot}
      />,
    );

    await waitFor(() => {
      expect(renderSpy).toHaveBeenLastCalledWith(nextSnapshot, {
        circleGeometryMode: 'deformed',
        circleLayout: 'radial',
        oneDView: 'ring',
        quantity: 'magnitude',
        showLattice: true,
        showSprings: false,
      });
    });

    expect(constructorSpy).toHaveBeenCalledTimes(1);
    expect(destroySpy).not.toHaveBeenCalled();
  });

  it('retries renderer startup cleanly after an initialization failure', async () => {
    const user = userEvent.setup();
    constructorSpy.mockClear();
    renderSpy.mockClear();
    initSpy.mockClear();
    destroySpy.mockClear();
    initSpy
      .mockImplementationOnce(() => Promise.reject(new Error('init failed')))
      .mockImplementationOnce(() => Promise.resolve());

    render(
      <PrototypeCanvas
        quantity="displacement"
        showLattice
        showSprings
        snapshot={snapshot}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/renderer failed to load/i);
    });

    await user.click(screen.getByRole('button', { name: /retry renderer/i }));

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(renderSpy).toHaveBeenCalled();
    });

    expect(constructorSpy).toHaveBeenCalledTimes(2);
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('canvas[data-testid="mock-renderer-canvas"]')).toHaveLength(1);
  });

  it('passes the fixed circular geometry mode through to the renderer', async () => {
    constructorSpy.mockClear();
    renderSpy.mockClear();
    initSpy.mockClear();

    render(
      <PrototypeCanvas
        quantity="displacement"
        showLattice
        showSprings
        circleGeometryMode="fixed"
        snapshot={snapshot}
      />,
    );

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledWith(snapshot, {
        circleGeometryMode: 'fixed',
        circleLayout: 'radial',
        oneDView: 'ring',
        quantity: 'displacement',
        showLattice: true,
        showSprings: true,
      });
    });
  });

  it('does not duplicate canvases across unmount and remount', async () => {
    constructorSpy.mockClear();
    renderSpy.mockClear();
    initSpy.mockClear();
    destroySpy.mockClear();

    const firstRender = render(
      <PrototypeCanvas
        quantity="displacement"
        showLattice
        showSprings
        snapshot={snapshot}
      />,
    );

    await waitFor(() => {
      expect(document.querySelectorAll('canvas[data-testid="mock-renderer-canvas"]')).toHaveLength(1);
    });

    firstRender.unmount();
    expect(document.querySelectorAll('canvas[data-testid="mock-renderer-canvas"]')).toHaveLength(0);

    render(
      <PrototypeCanvas
        quantity="displacement"
        showLattice
        showSprings
        snapshot={snapshot}
      />,
    );

    await waitFor(() => {
      expect(document.querySelectorAll('canvas[data-testid="mock-renderer-canvas"]')).toHaveLength(1);
    });
  });
});
