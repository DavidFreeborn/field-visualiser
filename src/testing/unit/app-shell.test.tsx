import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../components/layout/PrototypeCanvas', () => ({
  PrototypeCanvas: () => <div>Prototype canvas stub</div>,
}));

import { App } from '../../app/App';

describe('App', () => {
  it('renders the periodic prototype shell with classical mode active by default', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: /periodic lattice visualisation with classical and one-particle views/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(/1d periodic classical lattice/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Classical field')).toBeInTheDocument();
  });

  it('switches to the quantum one-particle controls', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(
      screen.getByLabelText(/interpretation mode/i),
      'quantum-one-particle',
    );

    expect(
      screen.getByRole('heading', { name: /1d periodic free-field one-particle mode/i }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Probability density')).toBeInTheDocument();
  });
});
