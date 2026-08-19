// End-to-end 2D quantum performance probe. Wraps window.Worker to count the
// scheduler protocol messages, samples the displayed simulation time from the
// status strip, and diffs screenshots to detect a visually frozen field.
// Usage: node scripts/perf2d.mjs [port]
import { chromium } from '@playwright/test';

const PORT = process.argv[2] ?? '4173';
const BASE = `http://localhost:${PORT}`;

function scene(payload) {
  return `${BASE}/?scene=${encodeURIComponent(JSON.stringify(payload))}`;
}

const CASES = [
  {
    name: 'torus 24x24 site-localized (default)',
    payload: {
      v: 1, mode: 'quantum-one-particle', geometry: 'torus-periodic',
      quantity: 'probability-density', playing: true, speed: 1,
      showLattice: false, showSprings: false,
      config: { size: 24, waveSpeed: 1, domainLength: 1, initialCenterX: 0.5, initialCenterY: 0.5, gaussianWidth: 0.12, momentumWidth: 1.2, modeNumberX: 3, modeNumberY: 0, initialPreset: 'site-localized' },
    },
  },
  {
    name: 'torus 96x96 site-localized (max)',
    payload: {
      v: 1, mode: 'quantum-one-particle', geometry: 'torus-periodic',
      quantity: 'probability-density', playing: true, speed: 1,
      showLattice: false, showSprings: false,
      config: { size: 96, waveSpeed: 1, domainLength: 1, initialCenterX: 0.5, initialCenterY: 0.5, gaussianWidth: 0.12, momentumWidth: 1.2, modeNumberX: 3, modeNumberY: 0, initialPreset: 'site-localized' },
    },
  },
  {
    name: 'square 81x81 site-localized (max fixed)',
    payload: {
      v: 1, mode: 'quantum-one-particle', geometry: 'square-fixed',
      quantity: 'probability-density', playing: true, speed: 1,
      showLattice: false, showSprings: false,
      config: { size: 81, waveSpeed: 1, domainLength: 1, initialCenterX: 0.5, initialCenterY: 0.5, gaussianWidth: 0.12, momentumWidth: 1.2, modeNumberX: 1, modeNumberY: 1, initialPreset: 'site-localized' },
    },
  },
  {
    name: 'square 81x81 gaussian packet',
    payload: {
      v: 1, mode: 'quantum-one-particle', geometry: 'square-fixed',
      quantity: 'probability-density', playing: true, speed: 1,
      showLattice: false, showSprings: false,
      config: { size: 81, waveSpeed: 1, domainLength: 1, initialCenterX: 0.5, initialCenterY: 0.5, gaussianWidth: 0.12, momentumWidth: 1.2, modeNumberX: 1, modeNumberY: 1, initialPreset: 'gaussian-wavepacket' },
    },
  },
  {
    name: 'torus 48x48 selected normal mode (expected stationary probability)',
    payload: {
      v: 1, mode: 'quantum-one-particle', geometry: 'torus-periodic',
      quantity: 'probability-density', playing: true, speed: 1,
      showLattice: false, showSprings: false,
      config: { size: 48, waveSpeed: 1, domainLength: 1, initialCenterX: 0.5, initialCenterY: 0.5, gaussianWidth: 0.12, momentumWidth: 1.2, modeNumberX: 3, modeNumberY: 2, initialPreset: 'selected-normal-mode' },
    },
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

await page.addInitScript(() => {
  const stats = {
    sent: 0,
    received: 0,
    configures: 0,
    setTimes: 0,
    setTimesWithRecycled: 0,
    lastTargetTime: 0,
    lastSnapshotTime: 0,
    firstReplyAt: 0,
    lastReplyAt: 0,
  };
  window.__workerStats = stats;
  const RealWorker = window.Worker;
  window.Worker = class extends RealWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', (event) => {
        stats.received += 1;
        stats.lastReplyAt = performance.now();
        if (stats.firstReplyAt === 0) stats.firstReplyAt = stats.lastReplyAt;
        const data = event.data;
        if (data && data.snapshot && typeof data.snapshot.time === 'number') {
          stats.lastSnapshotTime = data.snapshot.time;
        }
      });
    }
    postMessage(message, transfer) {
      stats.sent += 1;
      if (message && message.type === 'configure') stats.configures += 1;
      if (message && message.type === 'set-time') {
        stats.setTimes += 1;
        if (message.recycledBuffer || message.recycledBuffers) stats.setTimesWithRecycled += 1;
        stats.lastTargetTime = message.targetTime;
      }
      return super.postMessage(message, transfer);
    }
  };
});

for (const item of CASES) {
  await page.goto(scene(item.payload));
  await page.waitForTimeout(2500); // warm up
  const start = await page.evaluate(() => ({ ...window.__workerStats, now: performance.now() }));
  const shotA = await page.locator('.visual-canvas').screenshot();
  await page.waitForTimeout(8000);
  const shotB = await page.locator('.visual-canvas').screenshot();
  const end = await page.evaluate(() => ({ ...window.__workerStats, now: performance.now() }));

  const wallSeconds = (end.now - start.now) / 1000;
  const replies = end.received - start.received;
  const simAdvance = end.lastSnapshotTime - start.lastSnapshotTime;
  const lag = end.lastTargetTime - end.lastSnapshotTime;
  let diffBytes = 0;
  const len = Math.min(shotA.length, shotB.length);
  for (let i = 0; i < len; i += 1) {
    if (shotA[i] !== shotB[i]) diffBytes += 1;
  }

  console.log(`\n=== ${item.name} ===`);
  console.log(`worker replies/s     : ${(replies / wallSeconds).toFixed(1)}`);
  console.log(`set-time msgs        : ${end.setTimes - start.setTimes} (recycled: ${end.setTimesWithRecycled - start.setTimesWithRecycled})`);
  console.log(`configures in window : ${end.configures - start.configures}`);
  console.log(`sim time advance     : ${simAdvance.toFixed(3)} s over ${wallSeconds.toFixed(1)} s wall (ratio ${(simAdvance / wallSeconds).toFixed(2)})`);
  console.log(`target - displayed   : ${lag.toFixed(4)} s`);
  console.log(`screenshot diff bytes: ${diffBytes} (${((100 * diffBytes) / len).toFixed(1)}% of PNG)`);
}

console.log(`\npage errors: ${pageErrors.length === 0 ? 'none' : pageErrors.join(' | ')}`);
await browser.close();
