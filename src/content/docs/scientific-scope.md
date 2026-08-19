# Scientific scope

Field Visualiser is a pedagogical visualiser for two explicitly documented
finite lattice models: the classical nearest-neighbour semi-discrete wave
equation, and the square-root lattice quantum model
`i dpsi/dt = c sqrt(-Delta_h) psi` (exact unitary evolution of a lattice
wavefunction, hbar = 1).

Version 1 explicitly excludes interacting quantum field theory, particle
creation, mass terms, field operators, and covariant relativistic
localization. The classical engines are second-order-accurate lattice
solvers, not exact continuum solvers; the quantum engines evolve the lattice
dispersion `omega_k = (2c/h)|sin(pi k/N)|`, not the continuum `c|k|`. The
displayed `|psi_i|^2` is a lattice site probability. See `docs/MODEL.md` for
derivations, validation evidence, and interpretation limits.
