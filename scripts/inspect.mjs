// Manual QA driver: loads representative scenes in a real Chromium against
// the production preview server, captures screenshots, and reports console
// errors. Run: node scripts/inspect.mjs (requires `npm run build` first;
// starts its own preview server).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;

function scene(payload) {
  return `${BASE}/?scene=${encodeURIComponent(JSON.stringify(payload))}`;
}

const SCENES = [
  {
    name: '1d-quantum-2048-plot',
    url: scene({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'periodic-circle',
      quantity: 'probability-density',
      view1d: 'plot',
      playing: true,
      speed: 1,
      showLattice: true,
      showSprings: false,
      config: { siteCount: 2048, waveSpeed: 1, domainLength: 1, initialCenter: 0.5, gaussianWidth: 0.04, momentumWidth: 2, modeNumber: 8, initialPreset: 'gaussian-wavepacket' },
    }),
  },
  {
    name: '1d-quantum-2048-fixed-ring',
    url: scene({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'periodic-circle-fixed',
      quantity: 'probability-density',
      view1d: 'ring',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: { siteCount: 2048, waveSpeed: 1, domainLength: 1, initialCenter: 0.5, gaussianWidth: 0.04, momentumWidth: 2, modeNumber: 8, initialPreset: 'gaussian-wavepacket' },
    }),
  },
  {
    name: '1d-classical-128-plot',
    url: scene({
      v: 1,
      mode: 'classical',
      geometry: 'periodic-circle',
      quantity: 'displacement',
      view1d: 'plot',
      playing: true,
      speed: 1,
      showLattice: true,
      showSprings: true,
      config: { siteCount: 128, waveSpeed: 1, domainLength: 1, amplitude: 0.9, initialCenter: 0.5, gaussianWidth: 0.06, initialPreset: 'gaussian-displacement' },
    }),
  },
  {
    name: '1d-quantum-512-phase',
    url: scene({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'fixed-interval',
      quantity: 'phase-magnitude',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: { siteCount: 513, waveSpeed: 1, domainLength: 1, initialCenter: 0.35, gaussianWidth: 0.06, momentumWidth: 2, modeNumber: 10, initialPreset: 'gaussian-wavepacket' },
    }),
  },
  {
    name: '2d-quantum-96-torus',
    url: scene({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'torus-periodic',
      quantity: 'probability-density',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: { size: 96, waveSpeed: 1, domainLength: 1, initialCenterX: 0.5, initialCenterY: 0.5, gaussianWidth: 0.1, momentumWidth: 1.2, modeNumberX: 3, modeNumberY: 0, initialPreset: 'gaussian-wavepacket' },
    }),
  },
  {
    name: '2d-quantum-96-phase',
    url: scene({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'torus-periodic',
      quantity: 'phase-magnitude',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: { size: 96, waveSpeed: 1, domainLength: 1, initialCenterX: 0.5, initialCenterY: 0.5, gaussianWidth: 0.1, momentumWidth: 1.2, modeNumberX: 3, modeNumberY: 0, initialPreset: 'gaussian-wavepacket' },
    }),
  },
  {
    name: '2d-classical-256-square',
    url: scene({
      v: 1,
      mode: 'classical',
      geometry: 'square-fixed',
      quantity: 'displacement',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: { geometry: 'square-fixed', size: 256, waveSpeed: 1, domainLength: 1, amplitude: 0.9, gaussianWidth: 0.08, initialPreset: 'central-gaussian-displacement' },
    }),
  },
  {
    name: 'transition-ring-to-2d',
    url: scene({
      v: 1,
      mode: 'classical',
      geometry: 'periodic-circle-fixed',
      quantity: 'displacement',
      view1d: 'ring',
      playing: true,
      speed: 1,
      showLattice: true,
      showSprings: true,
      config: { siteCount: 128, waveSpeed: 1, domainLength: 1, amplitude: 0.9, initialCenter: 0.5, gaussianWidth: 0.06, initialPreset: 'gaussian-displacement' },
    }),
    action: async (page) => {
      // Reproduce the stale-guide defect scenario: circular view -> 2D torus.
      await page.getByLabel('Geometry').selectOption('torus-periodic');
      await page.waitForTimeout(1200);
    },
  },
];

// Expects a preview server already running on PORT, e.g.:
//   npx vite preview --port 4179 --strictPort
{
  const deadline = Date.now() + 30000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE);
      if (response.ok) {
        up = true;
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!up) {
    throw new Error(`no preview server on port ${PORT}; start one with: npx vite preview --port ${PORT}`);
  }
}

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

for (const item of SCENES) {
  await page.goto(item.url);
  await page.waitForTimeout(1800);
  if (item.action) {
    await item.action(page);
  }
  await page.screenshot({ path: `screenshots/${item.name}.png` });
  console.log(`captured ${item.name}`);
}

await browser.close();

if (consoleErrors.length > 0) {
  console.log('CONSOLE ERRORS:');
  for (const error of consoleErrors) {
    console.log(` - ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log('No console errors.');
}
