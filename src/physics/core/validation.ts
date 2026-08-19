/**
 * Shared configuration and time-input validation for every engine.
 *
 * Engines throw descriptive errors instead of clamping silently or letting
 * NaN/Infinity contaminate typed arrays; URL-scene sanitization (which falls
 * back to defaults instead of throwing) lives separately in sceneState.
 */

/**
 * Largest |omega_max * t| accepted for quantum modal evolution. Beyond this,
 * double-precision argument reduction in sin/cos loses meaningful phase
 * resolution (ulp(1e12) ~ 1.2e-4 rad), so larger times are rejected rather
 * than silently producing meaningless trigonometric phases.
 */
export const MAX_RESOLVABLE_MODAL_PHASE = 1e12;

/**
 * Largest number of internal Verlet substeps a single step(dt) request may
 * expand into. A huge but finite dt must fail fast instead of hanging the
 * process.
 */
export const MAX_SUBSTEPS_PER_STEP = 100_000;

export function assertFiniteNumber(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `${name} must be a finite number, received ${String(value)}.`,
    );
  }
}

export function assertPositiveFinite(value: number, name: string): void {
  assertFiniteNumber(value, name);

  if (value <= 0) {
    throw new Error(`${name} must be positive, received ${String(value)}.`);
  }
}

export function assertIntegerInRange(
  value: number,
  name: string,
  min: number,
  max: number,
): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer, received ${String(value)}.`);
  }

  if (value < min || value > max) {
    throw new Error(
      `${name} must be between ${min} and ${max}, received ${String(value)}.`,
    );
  }
}

export function assertUnitInterval(value: number, name: string): void {
  assertFiniteNumber(value, name);

  if (value < 0 || value > 1) {
    throw new Error(`${name} must lie in [0, 1], received ${String(value)}.`);
  }
}

/**
 * Validates a requested absolute quantum time: it must be finite and its
 * fastest modal phase must remain resolvable in double precision.
 */
export function assertResolvableQuantumTime(
  time: number,
  maximumFrequency: number,
): void {
  assertFiniteNumber(time, 'time');

  if (Math.abs(maximumFrequency * time) > MAX_RESOLVABLE_MODAL_PHASE) {
    throw new Error(
      `time ${String(time)} is too large: the maximum modal phase ` +
        `|omega_max * t| = ${String(Math.abs(maximumFrequency * time))} exceeds ` +
        `${String(MAX_RESOLVABLE_MODAL_PHASE)} and cannot be resolved meaningfully ` +
        'in double precision.',
    );
  }
}

/**
 * Computes the internal substep count for a classical Verlet step. Throws on
 * non-finite dt and on requests that would need an impractically large number
 * of substeps. Returns 0 for dt <= 0 (a documented no-op).
 */
export function computeSubstepCount(
  dt: number,
  safeInternalDt: number,
): number {
  assertFiniteNumber(dt, 'dt');

  if (dt <= 0) {
    return 0;
  }

  const substeps = Math.ceil(dt / safeInternalDt);

  if (!Number.isFinite(substeps) || substeps > MAX_SUBSTEPS_PER_STEP) {
    throw new Error(
      `dt ${String(dt)} would require ${String(substeps)} substeps, exceeding the ` +
        `limit of ${String(MAX_SUBSTEPS_PER_STEP)}.`,
    );
  }

  return Math.max(1, substeps);
}

/**
 * Validates a mode-number list for superposition presets: non-empty, all
 * integers within [min, max], and free of duplicates.
 */
export function assertModeNumberList(
  modeNumbers: readonly number[],
  name: string,
  min: number,
  max: number,
): void {
  // Defensive against untyped callers (shared scene payloads).
  const entries: readonly number[] = Array.isArray(modeNumbers)
    ? modeNumbers
    : [];

  if (entries.length === 0) {
    throw new Error(`${name} must be a non-empty list of mode numbers.`);
  }

  const seen = new Set<number>();

  for (const modeNumber of entries) {
    assertIntegerInRange(modeNumber, `${name} entry`, min, max);

    if (seen.has(modeNumber)) {
      throw new Error(`${name} must not repeat mode ${String(modeNumber)}.`);
    }

    seen.add(modeNumber);
  }
}

/**
 * Relative energy drift that reports zero for a zero-energy initial state
 * instead of NaN.
 */
export function computeRelativeEnergyDrift(
  baseline: number,
  current: number,
): number {
  if (baseline === 0) {
    return current === 0 ? 0 : Number.POSITIVE_INFINITY;
  }

  return Math.abs(current - baseline) / Math.abs(baseline);
}
