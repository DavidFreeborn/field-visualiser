interface DisplayControlsProps {
  /** Whether the active geometry is a periodic 1D system (ring view exists). */
  readonly showViewChoice: boolean;
  readonly view1d: 'plot' | 'ring';
  readonly scaleMode: 'auto' | 'fixed' | 'normalize';
  readonly onView1dChange: (view: 'plot' | 'ring') => void;
  readonly onScaleModeChange: (mode: 'auto' | 'fixed' | 'normalize') => void;
}

/**
 * Display-only choices, grouped apart from the physical configuration:
 * the 1D representation (unwrapped plot vs ring topology view) and the
 * explicit value-scale policy (never normalized silently).
 */
export function DisplayControls({
  showViewChoice,
  view1d,
  scaleMode,
  onView1dChange,
  onScaleModeChange,
}: DisplayControlsProps): React.JSX.Element {
  return (
    <fieldset className="control-group">
      <legend>Display</legend>
      <div className="control-grid">
        {showViewChoice ? (
          <label>
            <span>1D representation</span>
            <select
              value={view1d}
              onChange={(event) => onView1dChange(event.target.value as 'plot' | 'ring')}
            >
              <option value="ring">Circle (topology, default)</option>
              <option value="plot">Unwrapped plot (analysis view)</option>
            </select>
          </label>
        ) : null}
        <label>
          <span>Value scale</span>
          <select
            value={scaleMode}
            onChange={(event) =>
              onScaleModeChange(event.target.value as 'auto' | 'fixed' | 'normalize')
            }
          >
            <option value="auto">Automatic (fixed for signed, normalized for densities)</option>
            <option value="fixed">Fixed scale</option>
            <option value="normalize">Normalize each frame</option>
          </select>
        </label>
      </div>
    </fieldset>
  );
}
