// Headed-browser profiling of the two largest 2D quantum cases (real vsync).
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4179';
function sceneUrl(payload) {
  return `${BASE}/?scene=${encodeURIComponent(JSON.stringify(payload))}`;
}

const browser = await chromium.launch({
  headless: false,
  args: [
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});

async function profile(geometry, size) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    window.__ws = { responses: 0, stale: 0, latest: 0, computeMs: [] };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          const d = e.data;
          if (d && d.type === 'state') {
            window.__ws.responses += 1;
            if (d.generation < window.__ws.latest) window.__ws.stale += 1;
            if (d.timings) window.__ws.computeMs.push(d.timings.computeMs);
          }
        });
        const post = this.postMessage.bind(this);
        this.postMessage = (m, t) => {
          if (m && (m.type === 'configure' || m.type === 'set-time') && m.generation > window.__ws.latest) {
            window.__ws.latest = m.generation;
          }
          return t ? post(m, t) : post(m);
        };
      }
    };
  });
  await page.goto(sceneUrl({
    v: 1, mode: 'quantum-one-particle', geometry, quantity: 'probability-density',
    playing: true, speed: 1, showLattice: false, showSprings: false,
    config: {
      size, waveSpeed: 1, domainLength: 1, initialCenterX: 0.5, initialCenterY: 0.5,
      gaussianWidth: 0.1, momentumWidth: 1.2,
      modeNumberX: geometry === 'square-fixed' ? 2 : 3,
      modeNumberY: geometry === 'square-fixed' ? 1 : 0,
      initialPreset: 'gaussian-wavepacket',
    },
  }));
  await page.waitForTimeout(2500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const s0 = await page.evaluate(() => {
    if (window.gc) window.gc();
    return { responses: window.__ws.responses, heap: performance.memory?.usedJSHeapSize ?? null };
  });
  const frame = await page.evaluate(() => new Promise((resolve) => {
    const r = { frames: 0, longTasks: 0, longMs: 0, gaps: [] };
    let obs = null;
    try {
      obs = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) { r.longTasks += 1; r.longMs += e.duration; }
      });
      obs.observe({ type: 'longtask' });
    } catch { /* unsupported */ }
    let last = performance.now();
    const start = last;
    function tick(now) {
      r.frames += 1;
      if (r.frames > 1) r.gaps.push(now - last);
      last = now;
      if (now - start < 12000) requestAnimationFrame(tick);
      else { obs?.disconnect(); r.durationMs = now - start; resolve(r); }
    }
    requestAnimationFrame(tick);
  }));
  const s1 = await page.evaluate(() => {
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    if (window.gc) window.gc();
    return {
      responses: window.__ws.responses, stale: window.__ws.stale,
      meanComputeMs: mean(window.__ws.computeMs.slice(-500)),
      heap: performance.memory?.usedJSHeapSize ?? null,
    };
  });
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await page.close();
  frame.gaps.sort((a, b) => a - b);
  const seconds = frame.durationMs / 1000;
  console.log(JSON.stringify({
    case: `${geometry} ${size}x${size} (headed)`,
    fps: Number((frame.frames / seconds).toFixed(1)),
    meanGapMs: Number((frame.gaps.reduce((a, b) => a + b, 0) / frame.gaps.length).toFixed(2)),
    p95GapMs: Number(frame.gaps[Math.floor(frame.gaps.length * 0.95)].toFixed(2)),
    maxGapMs: Number(frame.gaps[frame.gaps.length - 1].toFixed(2)),
    dropped: frame.gaps.filter((g) => g > 33.4).length,
    longTasks: frame.longTasks,
    longTaskMs: Number(frame.longMs.toFixed(1)),
    workerUpdatesPerSec: Number(((s1.responses - s0.responses) / seconds).toFixed(1)),
    staleFrames: s1.stale,
    workerMeanComputeMs: s1.meanComputeMs === null ? null : Number(s1.meanComputeMs.toFixed(2)),
    scriptMsPerSec: Number((((m1.ScriptDuration - m0.ScriptDuration) * 1000) / seconds).toFixed(1)),
    heapGrowthMB: s0.heap !== null ? Number(((s1.heap - s0.heap) / 1e6).toFixed(2)) : null,
  }));
}

await profile('square-fixed', 81);
await profile('torus-periodic', 96);
await profile('torus-periodic', 96);
await browser.close();
