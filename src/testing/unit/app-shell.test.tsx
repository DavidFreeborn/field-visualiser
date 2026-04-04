import { useEffect } from 'react';
import { vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildSceneSearch, type SceneStateV1 } from '../../app/state/sceneState';

const prototypeCanvasMountSpy = vi.fn();
const prototypeCanvasUnmountSpy = vi.fn();

vi.mock('../../components/layout/PrototypeCanvas', () => ({
  PrototypeCanvas: () => {
    useEffect(() => {
      prototypeCanvasMountSpy();
      return () => {
        prototypeCanvasUnmountSpy();
      };
    }, []);

    return <div>Prototype canvas stub</div>;
  },
}));

import { App } from '../../app/App';

describe('App', () => {
  beforeEach(() => {
    prototypeCanvasMountSpy.mockClear();
    prototypeCanvasUnmountSpy.mockClear();
    window.history.replaceState({}, '', '/');
  });

  it('renders the periodic prototype shell with classical mode active by default', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: /visualising free fields/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(/classical nearest-neighbour ring with periodic wraparound, shown as a deforming circular embedding/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Classical field')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Periodic circle, deforming')).toBeInTheDocument();
  });

  it('switches to the quantum one-particle controls', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(
      screen.getByLabelText(/interpretation mode/i),
      'quantum-one-particle',
    );

    expect(screen.getByText(/free-field one-particle evolution on the periodic lattice hilbert space, shown on a deforming circular embedding/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Probability density')).toBeInTheDocument();
  });

  it('switches to the fixed-ring periodic circle controls', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/^geometry$/i), 'periodic-circle-fixed');

    expect(
      screen.getByText(/shown on a fixed circular domain with color encoding/i),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Periodic circle, fixed ring')).toBeInTheDocument();
    expect(screen.queryByLabelText(/circle motion/i)).not.toBeInTheDocument();
  });

  it('switches to the fixed-end interval controls', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/^geometry$/i), 'fixed-interval');

    expect(screen.getByText(/classical nearest-neighbour line with fixed zero endpoints/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Fixed-end interval')).toBeInTheDocument();
  });

  it('switches to the 2D square classical controls', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/^geometry$/i), 'square-fixed');

    expect(screen.getByText(/fixed zero boundaries on all edges/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('2D square, fixed edges')).toBeInTheDocument();
  });

  it('switches to the 2D torus quantum controls', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/^geometry$/i), 'torus-periodic');
    await user.selectOptions(
      screen.getByLabelText(/interpretation mode/i),
      'quantum-one-particle',
    );

    expect(screen.getByText(/exact separable phase evolution in a 2d periodic normal-mode basis/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('2D torus, periodic')).toBeInTheDocument();
  });

  it('keeps switching stable between preset, geometry, and mode changes', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(
      screen.getByLabelText(/interpretation mode/i),
      'quantum-one-particle',
    );
    expect(screen.getByText(/free-field one-particle evolution on the periodic lattice hilbert space/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^geometry$/i), 'square-fixed');
    expect(screen.getByText(/fixed zero boundary amplitudes/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/interpretation mode/i), 'classical');
    expect(screen.getByText(/fixed zero boundaries on all edges/i)).toBeInTheDocument();
  });

  it('reduces outer chrome in embedded mode while keeping the app usable', () => {
    render(<App embedded />);

    expect(
      screen.queryByRole('heading', {
        name: /visualising free fields/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/classical nearest-neighbour ring with periodic wraparound, shown as a deforming circular embedding/i)).toBeInTheDocument();
  });

  it('restores a valid shared scene from the URL', async () => {
    const sharedScene: SceneStateV1 = {
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'square-fixed',
      quantity: 'magnitude',
      playing: false,
      speed: 1.4,
      showLattice: true,
      showSprings: false,
      config: {
        size: 25,
        waveSpeed: 1,
        domainLength: 1,
        initialCenterX: 0.3,
        initialCenterY: 0.7,
        gaussianWidth: 0.18,
        momentumWidth: 1.6,
        modeNumberX: 2,
        modeNumberY: 3,
        initialPreset: 'gaussian-wavepacket',
      },
    };

    window.history.replaceState({}, '', buildSceneSearch(sharedScene, '', { preserveEmbed: false }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/fixed zero boundary amplitudes/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('Magnitude |psi|')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('2D square, fixed edges')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
    expect(decodeURIComponent(window.location.search)).toContain('"geometry":"square-fixed"');
  });

  it('falls back safely when the URL scene state is malformed', () => {
    window.history.replaceState({}, '', '/?scene=not-json');

    render(<App />);

    expect(screen.getByText(/classical nearest-neighbour ring with periodic wraparound, shown as a deforming circular embedding/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Classical field')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Periodic circle, deforming')).toBeInTheDocument();
  });

  it('does not remount the canvas during URL-driven scene restoration', async () => {
    const sharedScene: SceneStateV1 = {
      v: 1,
      mode: 'classical',
      geometry: 'torus-periodic',
      quantity: 'velocity',
      playing: true,
      speed: 0.8,
      showLattice: true,
      showSprings: false,
      config: {
        geometry: 'torus-periodic',
        size: 48,
        waveSpeed: 1,
        domainLength: 1,
        amplitude: 0.9,
        gaussianWidth: 0.08,
        initialPreset: 'wraparound-pulse',
      },
    };

    window.history.replaceState({}, '', buildSceneSearch(sharedScene, '', { preserveEmbed: false }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/opposite edges identified/i)).toBeInTheDocument();
    });

    expect(prototypeCanvasMountSpy).toHaveBeenCalledTimes(1);
    expect(prototypeCanvasUnmountSpy).not.toHaveBeenCalled();
  });
});
