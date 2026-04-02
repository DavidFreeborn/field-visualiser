import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { vi } from 'vitest';
import { usePeriodicClassicalPrototype } from '../../app/state/usePeriodicClassicalPrototype';

describe('usePeriodicClassicalPrototype', () => {
  it('does not reset the simulation when changing displayed quantity', async () => {
    const user = userEvent.setup();

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1);
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    function Probe(): React.JSX.Element {
      const controller = usePeriodicClassicalPrototype();

      useEffect(() => {
        controller.setPlaying(false);
      }, [controller]);

      return (
        <div>
          <div data-testid="time">{controller.snapshot.time.toFixed(6)}</div>
          <div data-testid="displacement">
            {controller.snapshot.displacement[0]?.toFixed(6) ?? 'nan'}
          </div>
          <button
            type="button"
            onClick={controller.stepOnce}
          >
            step
          </button>
          <button
            type="button"
            onClick={() => controller.setQuantity('velocity')}
          >
            velocity
          </button>
        </div>
      );
    }

    render(<Probe />);

    await user.click(screen.getByRole('button', { name: 'step' }));

    const timeBefore = screen.getByTestId('time').textContent;
    const displacementBefore = screen.getByTestId('displacement').textContent;

    await user.click(screen.getByRole('button', { name: 'velocity' }));

    expect(screen.getByTestId('time')).toHaveTextContent(timeBefore ?? '');
    expect(screen.getByTestId('displacement')).toHaveTextContent(displacementBefore ?? '');

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });
});
