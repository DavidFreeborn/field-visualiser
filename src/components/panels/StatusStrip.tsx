interface StatusStripProps {
  readonly time: number;
  readonly requestedSpeed: number;
  readonly achievedSpeedRatio: number | null;
  readonly playing: boolean;
  readonly resolutionLabel: string;
  readonly spacing: number;
  /** Quantum norm error, when the active system is quantum. */
  readonly normError?: number;
  /** Classical relative energy drift, when the active system is classical. */
  readonly energyDrift?: number;
  /** Worker field-update rate (2D quantum only). */
  readonly fieldUpdatesPerSecond?: number | null;
  /** Requested-target minus displayed simulation time (2D quantum only). */
  readonly targetLagSeconds?: number | null;
}

const SLOW_PLAYBACK_WARNING_FRACTION = 0.9;

/**
 * Compact always-visible diagnostics: simulation time, requested vs achieved
 * playback speed, grid facts, and the conservation figure appropriate to the
 * active mode. Values update at the throttled diagnostics cadence (~3 Hz).
 */
export function StatusStrip({
  time,
  requestedSpeed,
  achievedSpeedRatio,
  playing,
  resolutionLabel,
  spacing,
  normError,
  energyDrift,
  fieldUpdatesPerSecond,
  targetLagSeconds,
}: StatusStripProps): React.JSX.Element {
  const isSlow =
    playing &&
    achievedSpeedRatio !== null &&
    achievedSpeedRatio < requestedSpeed * SLOW_PLAYBACK_WARNING_FRACTION;

  return (
    <div className="status-strip">
      <dl className="status-grid">
        <div>
          <dt>Sim time</dt>
          <dd>{time.toFixed(3)}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>
            {requestedSpeed.toFixed(1)}&times;
            {achievedSpeedRatio !== null
              ? ` (achieved ${achievedSpeedRatio.toFixed(2)}×)`
              : ''}
          </dd>
        </div>
        <div>
          <dt>Sites</dt>
          <dd>{resolutionLabel}</dd>
        </div>
        <div>
          <dt>Spacing</dt>
          <dd>{spacing.toPrecision(3)}</dd>
        </div>
        {normError !== undefined ? (
          <div>
            <dt>Norm error</dt>
            <dd>{normError.toExponential(2)}</dd>
          </div>
        ) : null}
        {energyDrift !== undefined ? (
          <div>
            <dt>Energy drift</dt>
            <dd>{energyDrift.toExponential(2)}</dd>
          </div>
        ) : null}
        {fieldUpdatesPerSecond !== undefined && fieldUpdatesPerSecond !== null ? (
          <div>
            <dt>Field updates/s</dt>
            <dd>{fieldUpdatesPerSecond.toFixed(0)}</dd>
          </div>
        ) : null}
        {targetLagSeconds !== undefined && targetLagSeconds !== null ? (
          <div>
            <dt>Lag</dt>
            <dd>{targetLagSeconds.toFixed(3)} s</dd>
          </div>
        ) : null}
      </dl>
      {isSlow ? (
        <p
          className="status-warning"
          role="status"
        >
          Playback is running below the requested speed
          {achievedSpeedRatio !== null
            ? ` (${achievedSpeedRatio.toFixed(2)}× of ${requestedSpeed.toFixed(1)}× requested)`
            : ''}
          .
        </p>
      ) : null}
    </div>
  );
}
