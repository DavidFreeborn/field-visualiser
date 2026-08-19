import { describe, expect, it } from 'vitest';
import { buildSceneSearch, parseSceneState, type SceneStateV1 } from '../../app/state/sceneState';

describe('sceneState', () => {
  it('round-trips a valid serialized scene state', () => {
    const scene: SceneStateV1 = {
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'torus-periodic',
      quantity: 'probability-density',
      view1d: 'plot',
      scaleMode: 'auto',
      playing: false,
      speed: 1.7,
      showLattice: true,
      showSprings: false,
      config: {
        size: 24,
        waveSpeed: 1,
        domainLength: 1,
        initialCenterX: 0.4,
        initialCenterY: 0.6,
        gaussianWidth: 0.12,
        momentumWidth: 1.5,
        modeNumberX: 3,
        modeNumberY: 1,
        initialPreset: 'split-superposition',
      },
    };

    const search = buildSceneSearch(scene, '', { preserveEmbed: false });

    expect(parseSceneState(search)).toEqual(scene);
  });

  it('loads a legacy scene URL (serialized before view1d/scaleMode existed) with equivalent physics', () => {
    // Verbatim shape of a pre-overhaul share link payload.
    const legacyScene = encodeURIComponent(
      JSON.stringify({
        v: 1,
        mode: 'quantum-one-particle',
        geometry: 'periodic-circle',
        quantity: 'probability-density',
        playing: true,
        speed: 1.5,
        showLattice: true,
        showSprings: false,
        config: {
          siteCount: 512,
          waveSpeed: 1,
          domainLength: 1,
          initialCenter: 0.25,
          gaussianWidth: 0.05,
          momentumWidth: 2,
          modeNumber: 6,
          initialPreset: 'gaussian-wavepacket',
        },
      }),
    );

    const parsed = parseSceneState(`?scene=${legacyScene}`);

    expect(parsed).not.toBeNull();
    // Physical configuration is preserved exactly.
    expect(parsed?.config).toEqual({
      siteCount: 512,
      waveSpeed: 1,
      domainLength: 1,
      initialCenter: 0.25,
      gaussianWidth: 0.05,
      momentumWidth: 2,
      modeNumber: 6,
      initialPreset: 'gaussian-wavepacket',
    });
    expect(parsed?.mode).toBe('quantum-one-particle');
    expect(parsed?.geometry).toBe('periodic-circle');
    expect(parsed?.quantity).toBe('probability-density');
    expect(parsed?.speed).toBe(1.5);
    // New display fields fall back to defaults: circular geometries open as circles.
    expect(parsed?.view1d).toBe('ring');
    expect(parsed?.scaleMode).toBe('auto');
  });

  it.each([
    ['periodic-circle', { siteCount: 128 }],
    ['periodic-circle-fixed', { siteCount: 128 }],
    ['fixed-interval', { siteCount: 129 }],
  ] as const)('round-trips energy density for classical %s', (geometry, configPatch) => {
    const scene: SceneStateV1 = {
      v: 1,
      mode: 'classical',
      geometry,
      quantity: 'energy-density',
      ...(geometry === 'periodic-circle' ? { circleLayout: 'radial' as const } : {}),
      view1d: 'ring',
      scaleMode: 'auto',
      playing: true,
      speed: 1,
      showLattice: true,
      showSprings: true,
      config: {
        waveSpeed: 1,
        domainLength: 1,
        amplitude: 0.9,
        initialCenter: 0.5,
        gaussianWidth: 0.06,
        initialPreset: 'gaussian-displacement',
        ...configPatch,
      },
    };

    const parsed = parseSceneState(buildSceneSearch(scene, '', { preserveEmbed: false }));
    expect(parsed?.quantity).toBe('energy-density');
    expect(parsed?.geometry).toBe(geometry);
  });

  it.each(['square-fixed', 'torus-periodic'] as const)(
    'round-trips energy density for classical 2D %s',
    (geometry) => {
      const scene: SceneStateV1 = {
        v: 1,
        mode: 'classical',
        geometry,
        quantity: 'energy-density',
        view1d: 'ring',
        scaleMode: 'auto',
        playing: true,
        speed: 1,
        showLattice: false,
        showSprings: false,
        config: {
          geometry,
          size: 48,
          waveSpeed: 1,
          domainLength: 1,
          amplitude: 0.9,
          gaussianWidth: 0.08,
          initialPreset:
            geometry === 'torus-periodic' ? 'wraparound-pulse' : 'central-gaussian-displacement',
        },
      };

      const parsed = parseSceneState(buildSceneSearch(scene, '', { preserveEmbed: false }));
      expect(parsed?.quantity).toBe('energy-density');
    },
  );

  it('round-trips the combined real-imaginary-parts quantity for 1D quantum scenes', () => {
    const scene: SceneStateV1 = {
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'periodic-circle',
      quantity: 'real-imaginary-parts',
      view1d: 'ring',
      scaleMode: 'fixed',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: {
        siteCount: 512,
        waveSpeed: 1,
        domainLength: 1,
        initialCenter: 0.5,
        gaussianWidth: 0.08,
        momentumWidth: 2,
        modeNumber: 6,
        initialPreset: 'gaussian-wavepacket',
      },
    };

    const parsed = parseSceneState(buildSceneSearch(scene, '', { preserveEmbed: false }));
    expect(parsed?.quantity).toBe('real-imaginary-parts');
    expect(parsed?.view1d).toBe('ring');
  });

  it('rejects the combined quantity for 2D quantum scenes (falls back to probability)', () => {
    const scene = encodeURIComponent(
      JSON.stringify({
        v: 1,
        mode: 'quantum-one-particle',
        geometry: 'torus-periodic',
        quantity: 'real-imaginary-parts',
        playing: true,
        speed: 1,
        showLattice: false,
        showSprings: false,
        config: {},
      }),
    );

    expect(parseSceneState(`?scene=${scene}`)?.quantity).toBe('probability-density');
  });

  it('accepts the new phase-magnitude quantity for quantum scenes', () => {
    const scene = encodeURIComponent(
      JSON.stringify({
        v: 1,
        mode: 'quantum-one-particle',
        geometry: 'fixed-interval',
        quantity: 'phase-magnitude',
        playing: true,
        speed: 1,
        showLattice: false,
        showSprings: false,
        config: {},
      }),
    );

    expect(parseSceneState(`?scene=${scene}`)?.quantity).toBe('phase-magnitude');
  });

  it('returns null for malformed state payloads', () => {
    expect(parseSceneState('?scene=not-json')).toBeNull();
    expect(parseSceneState('?scene=%7B%22v%22%3A2%7D')).toBeNull();
  });

  it('sanitizes invalid fields back to safe defaults', () => {
    const invalidScene = encodeURIComponent(
      JSON.stringify({
        v: 1,
        mode: 'classical',
        geometry: 'fixed-interval',
        quantity: 'not-a-quantity',
        playing: 'yes',
        speed: 999,
        showLattice: 'not-bool',
        showSprings: 'not-bool',
        config: {
          siteCount: -10,
          waveSpeed: -4,
          domainLength: 0,
          amplitude: 9,
          initialCenter: 4,
          gaussianWidth: -1,
          initialPreset: 'bad-preset',
        },
      }),
    );

    expect(parseSceneState(`?scene=${invalidScene}`)).toEqual({
      v: 1,
      mode: 'classical',
      geometry: 'fixed-interval',
      quantity: 'displacement',
      view1d: 'ring',
      scaleMode: 'auto',
      playing: true,
      speed: 1,
      showLattice: true,
      showSprings: true,
      config: {
        siteCount: 129,
        waveSpeed: 1,
        domainLength: 1,
        amplitude: 0.9,
        initialCenter: 0.5,
        gaussianWidth: 0.06,
        initialPreset: 'gaussian-displacement',
      },
    });
  });

  it('round-trips the periodic circle layout toggle when present', () => {
    const scene: SceneStateV1 = {
      v: 1,
      mode: 'classical',
      geometry: 'periodic-circle',
      quantity: 'displacement',
      circleLayout: 'longitudinal',
      view1d: 'ring',
      scaleMode: 'fixed',
      playing: false,
      speed: 1,
      showLattice: true,
      showSprings: true,
      config: {
        siteCount: 128,
        waveSpeed: 1,
        domainLength: 1,
        amplitude: 0.9,
        initialCenter: 0.5,
        gaussianWidth: 0.06,
        initialPreset: 'gaussian-displacement',
      },
    };

    const search = buildSceneSearch(scene, '', { preserveEmbed: false });

    expect(parseSceneState(search)).toEqual(scene);
  });

  it('round-trips the fixed-ring periodic circle geometry', () => {
    const scene: SceneStateV1 = {
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'periodic-circle-fixed',
      quantity: 'magnitude',
      view1d: 'ring',
      scaleMode: 'normalize',
      playing: true,
      speed: 0.8,
      showLattice: true,
      showSprings: false,
      config: {
        siteCount: 128,
        waveSpeed: 1,
        domainLength: 1,
        initialCenter: 0.5,
        gaussianWidth: 0.08,
        momentumWidth: 2,
        modeNumber: 4,
        initialPreset: 'gaussian-wavepacket',
      },
    };

    const search = buildSceneSearch(scene, '', { preserveEmbed: false });

    expect(parseSceneState(search)).toEqual(scene);
  });
});
