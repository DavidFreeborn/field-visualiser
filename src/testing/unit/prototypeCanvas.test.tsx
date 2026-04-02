import { render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { PrototypeCanvas } from '../../components/layout/PrototypeCanvas';
import type { Classical1DPeriodicSnapshot } from '../../physics/classical/classical1dPeriodic';

const constructorSpy = vi.fn();
const initSpy = vi.fn(() => Promise.resolve());
const renderSpy = vi.fn();
const destroySpy = vi.fn();

vi.mock('../../rendering/pixi/PeriodicClassicalFieldRenderer', () => ({
  PeriodicClassicalFieldRenderer: class {
    public constructor(host: HTMLElement) {
      constructorSpy(host);
      void host;
    }

    public init(): Promise<void> {
      return initSpy();
    }

    public render(
      snapshot: Classical1DPeriodicSnapshot,
      options: { quantity: string; showLattice: boolean; showSprings: boolean },
    ): void {
      renderSpy(snapshot, options);
    }

    public destroy(): void {
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
      expect(renderSpy).toHaveBeenCalledWith(nextSnapshot, {
        quantity: 'velocity',
        showLattice: false,
        showSprings: true,
      });
    });

    expect(constructorSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(destroySpy).not.toHaveBeenCalled();
  });
});
