import { render, screen } from '@testing-library/react';
import { PrototypeControls } from '../../components/panels/PrototypeControls';
import { Classical2DControls } from '../../components/panels/Classical2DControls';
import { QuantumPrototypeControls } from '../../components/panels/QuantumPrototypeControls';
import { Quantum2DControls } from '../../components/panels/Quantum2DControls';
import { defaultClassical1DPeriodicConfig } from '../../app/presets/classical1dPeriodic';
import { defaultClassical1DFixedConfig } from '../../app/presets/classical1dFixed';
import { defaultClassical2DSquareConfig } from '../../app/presets/classical2dSquare';
import { defaultClassical2DTorusConfig } from '../../app/presets/classical2dTorus';
import { defaultQuantum1DPeriodicConfig } from '../../app/presets/quantum1dPeriodic';
import { defaultQuantum1DFixedConfig } from '../../app/presets/quantum1dFixed';
import { defaultQuantum2DTorusConfig } from '../../app/presets/quantum2dTorus';

const noop = (): void => undefined;

function optionValuesOf(labelPattern: RegExp): string[] {
  const select = screen.getByLabelText(labelPattern);
  return [...(select as HTMLSelectElement).options].map((option) => option.value);
}

describe('displayed-quantity options per control panel', () => {
  it('classical 1D periodic (deforming circle) offers local energy density', () => {
    render(
      <PrototypeControls
        config={defaultClassical1DPeriodicConfig}
        geometry="periodic-circle"
        mode="classical"
        playing
        quantity="displacement"
        circleLayout="radial"
        showLattice
        showSprings
        speed={1}
        onCircleLayoutChange={noop}
        onConfigChange={noop}
        onGeometryChange={noop}
        onModeChange={noop}
        onPlayingChange={noop}
        onQuantityChange={noop}
        onReset={noop}
        onShowLatticeChange={noop}
        onShowSpringsChange={noop}
        onSpeedChange={noop}
        onStep={noop}
      />,
    );
    const values = optionValuesOf(/^quantity$/i);
    expect(values).toContain('energy-density');
    expect(values).not.toContain('real-imaginary-parts');
  });

  it('classical 1D fixed ring offers local energy density', () => {
    render(
      <PrototypeControls
        config={defaultClassical1DPeriodicConfig}
        geometry="periodic-circle-fixed"
        mode="classical"
        playing
        quantity="displacement"
        circleLayout="radial"
        showLattice
        showSprings
        speed={1}
        onCircleLayoutChange={noop}
        onConfigChange={noop}
        onGeometryChange={noop}
        onModeChange={noop}
        onPlayingChange={noop}
        onQuantityChange={noop}
        onReset={noop}
        onShowLatticeChange={noop}
        onShowSpringsChange={noop}
        onSpeedChange={noop}
        onStep={noop}
      />,
    );
    expect(optionValuesOf(/^quantity$/i)).toContain('energy-density');
  });

  it('classical fixed-end interval offers local energy density', () => {
    render(
      <PrototypeControls
        config={defaultClassical1DFixedConfig}
        geometry="fixed-interval"
        mode="classical"
        playing
        quantity="displacement"
        circleLayout="radial"
        showLattice
        showSprings
        speed={1}
        onCircleLayoutChange={noop}
        onConfigChange={noop}
        onGeometryChange={noop}
        onModeChange={noop}
        onPlayingChange={noop}
        onQuantityChange={noop}
        onReset={noop}
        onShowLatticeChange={noop}
        onShowSpringsChange={noop}
        onSpeedChange={noop}
        onStep={noop}
      />,
    );
    expect(optionValuesOf(/^quantity$/i)).toContain('energy-density');
  });

  it.each([
    ['square-fixed', defaultClassical2DSquareConfig],
    ['torus-periodic', defaultClassical2DTorusConfig],
  ] as const)('classical 2D %s offers local energy density', (geometry, config) => {
    render(
      <Classical2DControls
        config={config}
        geometry={geometry}
        mode="classical"
        playing
        quantity="displacement"
        showLattice={false}
        speed={1}
        onConfigChange={noop}
        onGeometryChange={noop}
        onModeChange={noop}
        onPlayingChange={noop}
        onQuantityChange={noop}
        onReset={noop}
        onShowLatticeChange={noop}
        onSpeedChange={noop}
        onStep={noop}
      />,
    );
    const values = optionValuesOf(/quantity/i);
    expect(values).toContain('energy-density');
    expect(values).not.toContain('real-imaginary-parts');
  });

  it.each(['periodic-circle', 'periodic-circle-fixed', 'fixed-interval'] as const)(
    'quantum 1D %s offers the combined real and imaginary view',
    (geometry) => {
      render(
        <QuantumPrototypeControls
          config={
            geometry === 'fixed-interval'
              ? defaultQuantum1DFixedConfig
              : defaultQuantum1DPeriodicConfig
          }
          geometry={geometry}
          mode="quantum-one-particle"
          playing
          quantity="probability-density"
          showLattice
          speed={1}
          onConfigChange={noop}
          onGeometryChange={noop}
          onModeChange={noop}
          onPlayingChange={noop}
          onQuantityChange={noop}
          onReset={noop}
          onShowLatticeChange={noop}
          onSpeedChange={noop}
          onStep={noop}
        />,
      );
      const values = optionValuesOf(/displayed quantity/i);
      expect(values).toContain('real-imaginary-parts');
      expect(values).not.toContain('energy-density');
    },
  );

  it('quantum 2D controls do NOT offer the combined real and imaginary view', () => {
    render(
      <Quantum2DControls
        config={defaultQuantum2DTorusConfig}
        geometry="torus-periodic"
        mode="quantum-one-particle"
        playing
        quantity="probability-density"
        showLattice={false}
        speed={1}
        onConfigChange={noop}
        onGeometryChange={noop}
        onModeChange={noop}
        onPlayingChange={noop}
        onQuantityChange={noop}
        onReset={noop}
        onShowLatticeChange={noop}
        onSpeedChange={noop}
        onStep={noop}
      />,
    );
    const values = optionValuesOf(/displayed quantity/i);
    expect(values).not.toContain('real-imaginary-parts');
    expect(values).not.toContain('energy-density');
  });
});
