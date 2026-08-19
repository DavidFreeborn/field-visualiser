# The models, their numerics, and how they are validated

Field Visualiser implements two explicitly documented finite lattice models.
This document states exactly what they are, how they are discretized and
integrated, which invariants they satisfy, how those claims are verified, and
where the interpretation stops. It is written so that a physicist or
numerical analyst can inspect the model without reverse-engineering the UI.

## 1. Classical lattice field

### Geometry and equation of motion

Periodic 1D sites are `x_j = j h` with `h = L/N` and periodic indexing. The
fixed interval includes both endpoints, with `h = L/(N-1)` and
`u_0 = u_{N-1} = 0`, `v_0 = v_{N-1} = 0`. The semi-discrete wave equation is

    d^2 u_j / dt^2 = (c^2/h^2) (u_{j-1} - 2 u_j + u_{j+1}),

with the centred stencil applied only to interior sites in the Dirichlet
case. In 2D the five-point Laplacian is used, with h = L/N on the periodic
torus (both indices wrapped) and h = L/(N-1) on the fixed square (all four
edges pinned to zero).

### Hamiltonian and displayed local energy

The discrete Hamiltonian in dimension d is

    E_h = (h^d/2) sum_j v_j^2
        + (c^2 h^d/2) sum_{j,alpha} ((u_{j+e_alpha} - u_j)/h)^2,

with the bond sum following the topology (each physical bond counted exactly
once). For the energy-density display, half of each bond energy is assigned
to each endpoint, so the displayed density integrates back to the total:
`h * sum_j rho_j = E_h` in 1D and `h^2 * sum_j rho_j = E_h` in 2D (verified
to machine precision, Section 4).

### Time integration and stability

Velocity Verlet:

    v^{n+1/2} = v^n + (dt/2) a(u^n)
    u^{n+1}   = u^n + dt v^{n+1/2}
    v^{n+1}   = v^{n+1/2} + (dt/2) a(u^{n+1}).

The highest-mode stability limits are `dt <= h/c` in 1D and
`dt <= h/(sqrt(2) c)` in 2D. Requested steps beyond 95% of the limit are
subdivided internally;
non-finite steps are rejected, as are requests needing more than 100,000
substeps, so a huge finite dt fails fast instead of hanging.

Verlet is symplectic and second order: energy oscillates within a bounded
band rather than being conserved exactly per step, and it does not drift
secularly (measured bound in Section 4).

## 2. Quantum square-root lattice wavefunction

The quantum engines evolve a lattice wavefunction under the finite lattice
Hamiltonian

    i dpsi/dt = H_h psi,   H_h = c sqrt(-Delta_h),   hbar = 1.

### Spectra

Periodic 1D (note the lattice dispersion - NOT the continuum 2 pi c |k| / L):

    omega_k = (2c/h) |sin(pi k / N)|,  k = 0..N-1.

Fixed 1D with M = N-2 interior sites, in the orthonormal DST-I basis
`phi_m(j) = sqrt(2/(M+1)) sin(pi m (j+1)/(M+1))`:

    omega_m = (2c/h) sin(pi m / (2(M+1))),  m = 1..M.

2D periodic and fixed frequencies are the Euclidean combinations of the
corresponding 1D factors.

### Evolution and invariants

Initial modal coefficients are immutable, and evolution is absolute-time
modal rotation:

    psi_hat_k(t) = e^{-i omega_k t} psi_hat_k(0).

`setTime(t)` performs exactly one modal phase update and one inverse
transform regardless of the size of t (instrumented and asserted in tests).
The transforms are unitary (radix-2 FFT, Bluestein for arbitrary lengths,
DST-I via odd extension; dense references are retained only for equivalence
tests), so

    sum_j |psi_j|^2 = 1

is conserved, as is the spectral energy expectation
`<H_h> = sum_k omega_k |psi_hat_k|^2`. Non-finite times are rejected, as are
times whose maximum modal phase `|omega_max t|` exceeds 1e12, beyond which
double-precision trigonometric argument reduction stops being meaningful.

The displayed `|psi_j|^2` is a lattice **site probability** (it sums to
one). A density per unit length or area would be `|psi_j|^2 / h^d` under
continuum grid refinement.

Because `sqrt(-Delta_h)` is nonlocal, a decomposition such as
`Re[psi_j^* (H_h psi)_j]` sums to the global expectation but is not a unique
positive site energy, so no local quantum energy density is displayed;
classical local energy density remains available in every classical view.

## 3. Initial conditions worth understanding physically

- **Gaussian displacement, splits both ways.** A displacement packet with
  v(x,0) = 0 is the equal sum of left-moving and right-moving branches; the
  lattice does the same with additional lattice dispersion. On the radial
  ring embedding this can look like a wobble; the splitting is correct.
- **Zero-mean Gaussian velocity and the periodic zero mode.** A strictly
  positive velocity bump has positive spatial mean `v_bar`, and the periodic
  constant mode has zero restoring frequency, so `u_bar(t) = u_bar(0) +
v_bar t`: the whole ring drifts uniformly, which the radial embedding shows
  as expansion. The offered preset subtracts the exact discrete mean so the
  uniform mode is exactly unexcited. (The positive-mean variant survives at
  engine level as the cleanest zero-mode physics test.)
- **Exact right-moving packet.** The directional preset is constructed in
  the mode basis via `v_hat_k = -i sgn(k) omega_k u_hat_k` with the discrete
  `omega_k`; the self-conjugate Nyquist component is removed on even lattices
  (it has no distinct direction). A globally one-way state is incompatible
  with stationary Dirichlet endpoints, so no travelling preset exists on the
  fixed interval.
- **Standing/normal-mode superpositions.** The classical preset builds
  `u_j = A sum_{n in S}` (cos or sin) modes for the selected set S. The
  quantum preset builds the equal-weight state `(1/sqrt(k)) sum_{n in S}
phi_n`, which has exact unit norm because the mode bases are orthonormal.
  On the periodic lattice the n = 0 quantum mode is a legitimate static
  zero-energy eigenvector. Degenerate selections (counterpropagating or
  split presets at mode 0 or the even-lattice Nyquist mode) are rejected.
- **Coordinates.** Periodic data sample `x_j = j/N` with the shortest
  wrapped displacement (packets and localized states wrap through the seam);
  fixed grids use the full physical grid `x_j = j/(N-1)` with ordinary
  distance. Fixed Dirichlet Gaussian carriers use `e^{i pi (n_x x + n_y y)/L}`,
  consistent with the sine basis; periodic carriers use the 2 pi convention.

## 4. Validation

The dedicated suite `src/testing/unit/physicsVetting.test.ts` (part of
`npm test`) checks the implementation against independently derived analytic
expectations - never against the helper being tested. Representative
measured values from the suite's acceptance checks:

| Claim                      | Evidence                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Operator spectra           | Every periodic 1D Fourier mode and every Dirichlet sine mode matches -(4/h^2) sin^2(...) analytic eigenvalues to ~1e-9, plus representative 2D product modes |
| Temporal order (Verlet)    | Error ratio **3.910** when dt is halved against the exact semi-discrete standing-mode solution (second order; band 3.8-4.2)                                  |
| Spatial order (dispersion) | Modal frequency measured from actual phase evolution converges to the continuum at ratios **3.994 / 3.999** under grid doubling (band 3.9-4.1)               |
| Energy-density display     | Integrates to E_h with relative error ~**5e-16** in all four classical topologies                                                                            |
| Long-time energy           | Max relative drift **1.18e-3** over 20,000 recommended steps, oscillatory, non-secular                                                                       |
| Quantum unitarity          | Norm error **8.9e-16** and spectral-energy change **1.3e-15** at absolute time t = 10,000                                                                    |
| Superposition norms        | Multi-mode quantum states have unit norm and equal 1/k mode weights to 12 digits                                                                             |
| Determinism                | Every engine resets bit-identically to a fresh instance, twice                                                                                               |
| One transform per frame    | Instrumented inverse-transform counters assert exactly one per time update                                                                                   |

Reset behaviour is regression-tested end to end: changing field type,
geometry, initial state, mode selections, or lattice density returns the
destination model to exactly t = 0, and stale 2D worker results are
generation-filtered so they can never overwrite a newer reset.

Reproduce everything with:

```bash
npm test          # unit + physics vetting
npm run bench     # engine benchmarks (O(N log N) 1D, O(N^2 log N) 2D per displayed time)
npm run test:e2e  # Chromium end-to-end
node scripts/releaseGate.mjs  # scripted browser walkthrough (after build + preview)
```

## 5. Interpretation limits

1. **Lattice model, not continuum identity.** High-wavenumber modes have
   lattice dispersion; smooth resolved solutions converge at second order.
2. **A single-site state is a lattice basis state**, not a grid-independent
   smooth continuum delta approximation.
3. **The quantum Hamiltonian is massless and free.** There is no mass term,
   potential, interaction, particle creation, antiparticle sector, or field
   operators - this is not a quantized scalar field theory.
4. **The constant periodic quantum state is a valid zero-energy eigenvector**
   of the finite lattice Hamiltonian. In full massless scalar QFT on a
   compact space, the Laplacian zero mode is not an ordinary
   harmonic-oscillator Fock mode and the naive Gaussian vacuum is
   non-normalizable - one reason the model is not labelled as QFT.
5. **Site localization is not a covariant relativistic position
   observable.** Relativistic localization requires additional assumptions
   and is known to be subtle (Newton-Wigner).
6. **The circular display is an embedding** of a one-dimensional periodic
   field, not literal dynamics of a material ring in 2D space.
7. **Conservation and determinism are verified in IEEE-754 double
   precision** - numerical evidence, not a formal proof across hardware.

## 6. References

- T. D. Newton and E. P. Wigner, "Localized States for Elementary Systems,"
  _Reviews of Modern Physics_ 21, 400 (1949).
  https://journals.aps.org/rmp/abstract/10.1103/RevModPhys.21.400
  Cited only to establish that relativistic localization requires care and
  extra assumptions; the massless lattice site basis here is not itself a
  Newton-Wigner construction.
- F. Izsak and B. J. Szekeres, "Fractional operators in relativistic quantum
  mechanics: the square-root Klein-Gordon equation," _Annales Universitatis
  Scientiarum Budapestinensis, Sectio Mathematica_ 64, 93-108 (2021).
  https://www.researchgate.net/publication/385383747_Fractional_operators_in_relativistic_quantum_mechanics_the_square-root_Klein-Gordon_equation
- H. Huffel and G. Kelnhofer, "Field Space Entanglement Entropy, Zero Modes
  and Lifshitz Models," arXiv:1707.00888. https://arxiv.org/abs/1707.00888
  Relates non-normalizable massless scalar ground states on compact spaces
  to Laplacian zero modes.
