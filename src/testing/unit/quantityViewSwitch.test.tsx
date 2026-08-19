import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePeriodicQuantumPrototype } from '../../app/state/usePeriodicQuantumPrototype';

/**
 * Switching among the combined, real-only, imaginary-only, and phase views is
 * a display concern: it must not reset the simulation time or disturb the
 * norm.
 */
describe('quantum 1D view switching', () => {
  it('changing the displayed quantity preserves simulation time and norm', async () => {
    const user = userEvent.setup();

    function Probe(): React.JSX.Element {
      const controller = usePeriodicQuantumPrototype(false); // no animation loop
      return (
        <div>
          <div data-testid="time">{controller.snapshot.time.toFixed(6)}</div>
          <div data-testid="quantity">{controller.quantity}</div>
          <div data-testid="norm-error">{controller.diagnostics.normError.toExponential(2)}</div>
          <button
            type="button"
            onClick={controller.stepOnce}
          >
            step
          </button>
          {(
            ['real-imaginary-parts', 'real-part', 'imaginary-part', 'phase-magnitude'] as const
          ).map((quantity) => (
            <button
              key={quantity}
              type="button"
              onClick={() => controller.setQuantity(quantity)}
            >
              {quantity}
            </button>
          ))}
        </div>
      );
    }

    render(<Probe />);

    // Advance to a nonzero simulation time.
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'step' }));
      await user.click(screen.getByRole('button', { name: 'step' }));
    });
    const timeAfterSteps = screen.getByTestId('time').textContent;
    expect(Number(timeAfterSteps)).toBeGreaterThan(0);

    for (const quantity of [
      'real-imaginary-parts',
      'real-part',
      'imaginary-part',
      'phase-magnitude',
    ]) {
      await act(async () => {
        await user.click(screen.getByRole('button', { name: quantity }));
      });
      await waitFor(() => {
        expect(screen.getByTestId('quantity')).toHaveTextContent(quantity);
      });
      // Simulation time is untouched by the view switch.
      expect(screen.getByTestId('time').textContent).toBe(timeAfterSteps);
      // Norm preservation is unaffected.
      expect(Number(screen.getByTestId('norm-error').textContent)).toBeLessThan(1e-10);
    }
  });
});
