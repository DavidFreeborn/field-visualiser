import { describe, expect, it } from 'vitest';
import { buildSceneSearch, parseSceneState, type SceneStateV1 } from '../../app/state/sceneState';

describe('sceneState', () => {
  it('round-trips a valid serialized scene state', () => {
    const scene: SceneStateV1 = {
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'torus-periodic',
      quantity: 'probability-density',
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
