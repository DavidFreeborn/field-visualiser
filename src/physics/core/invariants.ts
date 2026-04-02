export interface ClassicalPeriodicEnergyBreakdown1D {
  readonly total: number;
  readonly kinetic: number;
  readonly potential: number;
  readonly localDensity: Float64Array;
}

export function computePeriodicClassicalEnergy1D(
  displacement: Float64Array,
  velocity: Float64Array,
  spacing: number,
  waveSpeed: number,
): ClassicalPeriodicEnergyBreakdown1D {
  const { length } = displacement;

  if (velocity.length !== length) {
    throw new Error('Velocity array must match displacement length.');
  }

  const inverseSpacing = 1 / spacing;
  const localDensity = new Float64Array(length);
  let kinetic = 0;
  let potential = 0;

  for (let index = 0; index < length; index += 1) {
    const nextIndex = (index + 1) % length;
    const bondSlope = (displacement[nextIndex] - displacement[index]) * inverseSpacing;
    const kineticDensity = 0.5 * velocity[index] * velocity[index];
    const bondPotentialDensity = 0.5 * waveSpeed * waveSpeed * bondSlope * bondSlope;

    kinetic += kineticDensity * spacing;
    potential += bondPotentialDensity * spacing;
    localDensity[index] += kineticDensity + 0.5 * bondPotentialDensity;
    localDensity[nextIndex] += 0.5 * bondPotentialDensity;
  }

  return {
    total: kinetic + potential,
    kinetic,
    potential,
    localDensity,
  };
}

export function computeDirichletClassicalEnergy1D(
  displacement: Float64Array,
  velocity: Float64Array,
  spacing: number,
  waveSpeed: number,
): ClassicalPeriodicEnergyBreakdown1D {
  const { length } = displacement;

  if (velocity.length !== length) {
    throw new Error('Velocity array must match displacement length.');
  }

  const inverseSpacing = 1 / spacing;
  const localDensity = new Float64Array(length);
  let kinetic = 0;
  let potential = 0;

  for (let index = 0; index < length; index += 1) {
    const kineticDensity = 0.5 * velocity[index] * velocity[index];
    kinetic += kineticDensity * spacing;
    localDensity[index] += kineticDensity;
  }

  for (let index = 0; index < length - 1; index += 1) {
    const bondSlope = (displacement[index + 1] - displacement[index]) * inverseSpacing;
    const bondPotentialDensity = 0.5 * waveSpeed * waveSpeed * bondSlope * bondSlope;

    potential += bondPotentialDensity * spacing;
    localDensity[index] += 0.5 * bondPotentialDensity;
    localDensity[index + 1] += 0.5 * bondPotentialDensity;
  }

  return {
    total: kinetic + potential,
    kinetic,
    potential,
    localDensity,
  };
}
