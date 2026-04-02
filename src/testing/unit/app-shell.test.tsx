import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../components/layout/PrototypeCanvas', () => ({
  PrototypeCanvas: () => <div>Prototype canvas stub</div>,
}));

import { App } from '../../app/App';

describe('App', () => {
  it('renders the 1D periodic prototype shell', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: /periodic classical field prototype, built on a strict scientific core/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/1d periodic classical lattice/i),
    ).toBeInTheDocument();
  });
});
