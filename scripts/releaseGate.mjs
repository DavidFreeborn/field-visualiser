// Release-gate manual-walkthrough driver: drives the production preview in
// real Chromium, captures screenshots for every required case, measures ring
// geometry and packet motion from rendered pixels, asserts the absence of
// removed UI, checks stale-frame behaviour, and profiles the two largest 2D
// quantum cases. Run after `npm run build` with a preview server on 4179:
//   npx vite preview --port 4179 --strictPort
//   node scripts/releaseGate.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const SHOTS = 'screenshots/release-gate';
const results = [];
const failures = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  if (!pass) failures.push({ name, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
}

function sceneUrl(payload) {
  return `${BASE}/?scene=${encodeURIComponent(JSON.stringify(payload))}`;
}

const classical1dBase = {
  siteCount: 128,
  waveSpeed: 1,
  domainLength: 1,
  amplitude: 0.9,
  initialCenter: 0.5,
  gaussianWidth: 0.06,
};

function classicalRingScene(preset, extra = {}) {
  return sceneUrl({
    v: 1,
    mode: 'classical',
    geometry: 'periodic-circle',
    quantity: 'displacement',
    view1d: 'ring',
    playing: false,
    speed: 1,
    showLattice: false,
    showSprings: false,
    config: { ...classical1dBase, initialPreset: preset },
    ...extra,
  });
}

// Analyzes the screenshot of the canvas element inside the page itself
// (Chromium decodes the PNG), returning the bounding box and mean radius of
// non-background pixels plus a per-column trace-deviation profile.
async function analyzeCanvas(page, options = {}) {
  const { inset = 0, darkOnly = false } = options;
  const canvas = page.locator('.visual-canvas');
  const buffer = await canvas.screenshot();
  const base64 = buffer.toString('base64');
  return page.evaluate(
    async ({ encoded, inset, darkOnly }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const scratch = document.createElement('canvas');
      scratch.width = image.width;
      scratch.height = image.height;
      const context = scratch.getContext('2d');
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(
        0,
        0,
        image.width,
        image.height,
      );

      // Dominant (background) colour = modal colour over the whole image
      // (corner pixels sit outside the rounded canvas border and are wrong).
      const histogram = new Map();
      for (let i = 0; i < data.length; i += 16) {
        const key =
          ((data[i] >> 3) << 10) |
          ((data[i + 1] >> 3) << 5) |
          (data[i + 2] >> 3);
        histogram.set(key, (histogram.get(key) ?? 0) + 1);
      }
      let modalKey = 0,
        modalCount = -1;
      for (const [key, keyCount] of histogram) {
        if (keyCount > modalCount) {
          modalCount = keyCount;
          modalKey = key;
        }
      }
      const bg = [
        ((modalKey >> 10) & 31) << 3,
        ((modalKey >> 5) & 31) << 3,
        (modalKey & 31) << 3,
      ];
      // darkOnly restricts to the near-black trace line, excluding the light
      // plot frame, baseline axis, and background washes; the inset excludes
      // the rounded canvas corners and edge markers.
      const isInk = (i) => {
        if (darkOnly) {
          return data[i] + data[i + 1] + data[i + 2] < 270;
        }
        const dr = data[i] - bg[0];
        const dg = data[i + 1] - bg[1];
        const db = data[i + 2] - bg[2];
        return dr * dr + dg * dg + db * db > 45 * 45;
      };
      // The canvas has a 20px CSS corner radius; panel background leaks into
      // the four corner squares only, so mask those instead of a full inset.
      const CORNER = 22;
      const inCorner = (x, y) =>
        (x < CORNER || x >= width - CORNER) &&
        (y < CORNER || y >= height - CORNER);

      let minX = width,
        maxX = -1,
        minY = height,
        maxY = -1,
        count = 0;
      let sumX = 0,
        sumY = 0;
      const columnSum = new Float64Array(width);
      const columnCount = new Float64Array(width);
      let bluish = 0,
        orangish = 0;

      for (let y = inset; y < height - inset; y += 1) {
        for (let x = inset; x < width - inset; x += 1) {
          if (inCorner(x, y)) continue;
          const i = (y * width + x) * 4;
          if (!isInk(i)) continue;
          count += 1;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          columnSum[x] += y;
          columnCount[x] += 1;
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          if (b > r + 30 && b > 90) bluish += 1;
          if (r > 170 && g > 90 && g < 190 && b < 90) orangish += 1;
        }
      }

      if (count === 0) {
        return { empty: true };
      }

      const cx = sumX / count;
      const cy = sumY / count;
      // Mean radial distance of ink from the ink centroid (ring radius proxy).
      let radiusSum = 0;
      for (let y = inset; y < height - inset; y += 1) {
        for (let x = inset; x < width - inset; x += 1) {
          if (inCorner(x, y)) continue;
          const i = (y * width + x) * 4;
          if (!isInk(i)) continue;
          radiusSum += Math.hypot(x - cx, y - cy);
        }
      }

      const columnMeanY = [];
      for (let x = 0; x < width; x += 1) {
        columnMeanY.push(
          columnCount[x] > 0 ? columnSum[x] / columnCount[x] : null,
        );
      }

      // Percentile extents are robust against small isolated glyphs (e.g. the
      // seam marker) that would otherwise stretch the raw bounding box.
      const xs = [];
      const ys = [];
      for (let y = inset; y < height - inset; y += 1) {
        for (let x = inset; x < width - inset; x += 1) {
          if (inCorner(x, y)) continue;
          if (isInk((y * width + x) * 4)) {
            xs.push(x);
            ys.push(y);
          }
        }
      }
      xs.sort((a, b) => a - b);
      ys.sort((a, b) => a - b);
      const lo = Math.floor(xs.length * 0.01);
      const hi = Math.floor(xs.length * 0.99);
      const robustExtent = {
        w: xs[hi] - xs[lo] + 1,
        h: ys[hi] - ys[lo] + 1,
      };

      return {
        robustExtent,
        empty: false,
        width,
        height,
        inkCount: count,
        bbox: {
          minX,
          maxX,
          minY,
          maxY,
          w: maxX - minX + 1,
          h: maxY - minY + 1,
        },
        centroid: { x: cx, y: cy },
        meanRadius: radiusSum / count,
        columnMeanY,
        bluish,
        orangish,
      };
    },
    { encoded: base64, inset, darkOnly },
  );
}

// Per-column deviation of the plot trace from its own median baseline.
function traceDeviation(columnMeanY) {
  const values = columnMeanY
    .filter((v) => v !== null)
    .slice()
    .sort((a, b) => a - b);
  const baseline = values[Math.floor(values.length / 2)];
  return columnMeanY.map((v) => (v === null ? 0 : Math.abs(v - baseline)));
}

function argmax(array, from = 0, to = array.length) {
  let best = from;
  for (let i = from; i < to; i += 1) if (array[i] > array[best]) best = i;
  return best;
}

async function displayTime(page) {
  return Number(
    await page.getByTestId('scene-layout').getAttribute('data-display-time'),
  );
}

async function assertNoClutter(page, label) {
  const counts = {
    statusStrip: await page.locator('.status-strip').count(),
    ringCenterOverlay: await page.locator('.ring-center-overlay').count(),
    diagnosticsPanel: await page.locator('.diagnostics-panel').count(),
    displayLegend: await page
      .locator('legend', { hasText: /^Display$/ })
      .count(),
    statusGrid: await page.locator('.status-grid').count(),
  };
  const clean = Object.values(counts).every((c) => c === 0);
  record(`no-clutter (${label})`, clean, counts);
}

async function assertNoOverflow(page, label) {
  const layout = await page.evaluate(() => {
    const doc = document.documentElement;
    const canvas = document
      .querySelector('.visual-canvas')
      ?.getBoundingClientRect();
    const controls = document
      .querySelector('.control-column')
      ?.getBoundingClientRect();
    const horizontalOverflow = doc.scrollWidth - window.innerWidth;
    let overlap = 0;
    if (canvas && controls) {
      const x =
        Math.min(canvas.right, controls.right) -
        Math.max(canvas.left, controls.left);
      const y =
        Math.min(canvas.bottom, controls.bottom) -
        Math.max(canvas.top, controls.top);
      overlap = x > 2 && y > 2 ? x * y : 0;
    }
    return { horizontalOverflow, overlap };
  });
  record(
    `no-overflow (${label})`,
    layout.horizontalOverflow <= 1 && layout.overlap === 0,
    layout,
  );
}

mkdirSync(SHOTS, { recursive: true });

// Wait for the preview server.
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
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!up) throw new Error(`no preview server on ${BASE}`);
}

const browser = await chromium.launch({
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const consoleErrors = [];

async function newPage(viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  // Instrument the 2D quantum worker channel for the profiling section.
  await page.addInitScript(() => {
    window.__workerStats = {
      configures: 0,
      responses: 0,
      stale: 0,
      latestGeneration: 0,
      computeMs: [],
      snapshotMs: [],
      roundTripMs: [],
      pending: new Map(),
    };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (event) => {
          const data = event.data;
          const stats = window.__workerStats;
          if (data && data.type === 'state') {
            stats.responses += 1;
            if (data.generation < stats.latestGeneration) stats.stale += 1;
            if (data.timings) {
              stats.computeMs.push(data.timings.computeMs);
              stats.snapshotMs.push(data.timings.snapshotMs);
            }
            const sentAt = stats.pending.get(data.snapshot?.time);
            if (sentAt !== undefined) {
              stats.roundTripMs.push(performance.now() - sentAt);
              stats.pending.delete(data.snapshot.time);
            }
          }
        });
        const nativePost = this.postMessage.bind(this);
        this.postMessage = (message, transfer) => {
          const stats = window.__workerStats;
          if (message && message.type === 'configure') {
            stats.configures += 1;
            stats.latestGeneration = message.generation;
            stats.pending.clear();
          }
          if (message && message.type === 'set-time') {
            if (message.generation > stats.latestGeneration)
              stats.latestGeneration = message.generation;
            stats.pending.set(message.targetTime, performance.now());
          }
          return transfer ? nativePost(message, transfer) : nativePost(message);
        };
      }
    };
  });
  return page;
}

// ---------------------------------------------------------------------------
// Section A: ring circularity + layout at four viewport sizes.
// ---------------------------------------------------------------------------
const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['wide', { width: 1920, height: 700 }],
  ['tall', { width: 800, height: 1200 }],
  ['narrow', { width: 420, height: 900 }],
];

for (const [name, viewport] of viewports) {
  const page = await newPage(viewport);
  await page.goto(
    sceneUrl({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'periodic-circle-fixed',
      quantity: 'probability-density',
      view1d: 'ring',
      playing: false,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: {
        siteCount: 256,
        waveSpeed: 1,
        domainLength: 1,
        initialCenter: 0.5,
        gaussianWidth: 0.08,
        momentumWidth: 2,
        modeNumber: 6,
        // Uniform |psi|^2 colours the whole ring band evenly, so the ink
        // bounding box measures the true circle diameter in both axes.
        initialPreset: 'selected-normal-mode',
      },
    }),
  );
  await page.waitForTimeout(2200);
  const analysis = await analyzeCanvas(page);
  await page.screenshot({ path: `${SHOTS}/ring-${name}.png`, fullPage: false });
  if (analysis.empty) {
    record(`ring-circular (${name})`, false, { empty: true });
  } else {
    const ratio = analysis.robustExtent.w / analysis.robustExtent.h;
    record(`ring-circular (${name})`, Math.abs(ratio - 1) < 0.03, {
      ringW: analysis.robustExtent.w,
      ringH: analysis.robustExtent.h,
      rawBboxW: analysis.bbox.w,
      rawBboxH: analysis.bbox.h,
      ratio: Number(ratio.toFixed(4)),
    });
  }
  await assertNoClutter(page, name);
  await assertNoOverflow(page, name);
  await page.close();
}

// ---------------------------------------------------------------------------
// Section B: classical ring dynamics (uniform mode vs zero-mean vs split vs
// travelling) measured from rendered pixels on the deforming ring / plot.
// ---------------------------------------------------------------------------
async function meanRadiusAfterPlay(preset, seconds, shotName) {
  const page = await newPage();
  await page.goto(classicalRingScene(preset));
  await page.waitForTimeout(2000);
  const before = await analyzeCanvas(page, { darkOnly: true });
  await page.screenshot({ path: `${SHOTS}/${shotName}-t0.png` });
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(seconds * 1000);
  await page.getByRole('button', { name: 'Pause' }).click();
  const after = await analyzeCanvas(page, { darkOnly: true });
  await page.screenshot({ path: `${SHOTS}/${shotName}-t1.png` });
  await page.close();
  return {
    before: before.meanRadius,
    after: after.meanRadius,
    growth: after.meanRadius - before.meanRadius,
  };
}

// The legacy positive-mean velocity preset was removed from the UI and from
// shared-scene acceptance: an old URL requesting it must load as the
// zero-mean correction (no uniform ring growth), not the uniform-mode drift.
const legacy = await meanRadiusAfterPlay(
  'gaussian-velocity',
  2.0,
  'legacy-gaussian-velocity-remapped',
);
const zeroMean = await meanRadiusAfterPlay(
  'zero-mean-gaussian-velocity',
  2.0,
  'zero-mean-gaussian-velocity',
);
record(
  'legacy velocity scene remaps to zero mean (no uniform growth)',
  Math.abs(legacy.growth) < 3,
  { growthPx: Number(legacy.growth.toFixed(2)) },
);
record(
  'zero-mean velocity produces no uniform growth',
  Math.abs(zeroMean.growth) < 3,
  { growthPx: Number(zeroMean.growth.toFixed(2)) },
);
{
  const page = await newPage();
  await page.goto(classicalRingScene('gaussian-velocity'));
  await page.waitForTimeout(1500);
  const presetValue = await page
    .getByLabel('Initial condition')
    .inputValue();
  record(
    'legacy velocity preset is not selectable and remaps in the UI',
    presetValue === 'zero-mean-gaussian-velocity',
    { presetValue },
  );
  await page.close();
}

// Gaussian displacement split (unwrapped plot view: two symmetric branches).
{
  const page = await newPage();
  await page.goto(
    classicalRingScene('gaussian-displacement', { view1d: 'plot' }),
  );
  await page.waitForTimeout(2000);
  const t0 = await analyzeCanvas(page, { darkOnly: true });
  await page.screenshot({ path: `${SHOTS}/gaussian-displacement-plot-t0.png` });
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Pause' }).click();
  const t1 = await analyzeCanvas(page, { darkOnly: true });
  await page.screenshot({ path: `${SHOTS}/gaussian-displacement-plot-t1.png` });

  const dev0 = traceDeviation(t0.columnMeanY);
  const dev1 = traceDeviation(t1.columnMeanY);
  const center = argmax(dev0);
  const leftPeak = argmax(dev1, 0, center - 10);
  const rightPeak = argmax(dev1, center + 10);
  const leftOffset = center - leftPeak;
  const rightOffset = rightPeak - center;
  const symmetric =
    dev1[leftPeak] > 0.35 * dev0[center] &&
    dev1[rightPeak] > 0.35 * dev0[center] &&
    Math.abs(leftOffset - rightOffset) <
      0.3 * Math.max(leftOffset, rightOffset);
  record('gaussian displacement splits both ways (plot)', symmetric, {
    centerX: center,
    leftPeakX: leftPeak,
    rightPeakX: rightPeak,
    leftAmp: Number(dev1[leftPeak].toFixed(1)),
    rightAmp: Number(dev1[rightPeak].toFixed(1)),
    initialAmp: Number(dev0[center].toFixed(1)),
  });
  // Ring-view screenshots of the same preset for the record.
  await page.goto(classicalRingScene('gaussian-displacement'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/gaussian-displacement-ring-t0.png` });
  await page.close();
}

// Exact right-moving packet: peak moves right, left branch suppressed.
{
  const page = await newPage();
  await page.goto(
    classicalRingScene('travelling-gaussian-right', {
      view1d: 'plot',
      config: {
        ...classical1dBase,
        initialCenter: 0.3,
        initialPreset: 'travelling-gaussian-right',
      },
    }),
  );
  await page.waitForTimeout(2000);
  const t0 = await analyzeCanvas(page, { darkOnly: true });
  await page.screenshot({ path: `${SHOTS}/travelling-right-plot-t0.png` });
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Pause' }).click();
  const t1 = await analyzeCanvas(page, { darkOnly: true });
  await page.screenshot({ path: `${SHOTS}/travelling-right-plot-t1.png` });
  await page.close();

  const dev0 = traceDeviation(t0.columnMeanY);
  const dev1 = traceDeviation(t1.columnMeanY);
  const start = argmax(dev0);
  const peak1 = argmax(dev1);
  const leftMax = Math.max(...dev1.slice(0, Math.max(1, start - 15)));
  record(
    'travelling packet moves right with left branch suppressed',
    peak1 > start + 8 && leftMax < 0.35 * dev1[peak1],
    {
      startPeakX: start,
      laterPeakX: peak1,
      shiftPx: peak1 - start,
      leftResidual: Number(leftMax.toFixed(1)),
      mainAmp: Number(dev1[peak1].toFixed(1)),
    },
  );
}

// ---------------------------------------------------------------------------
// Section C: combined Re/Im traces are present and distinguishable.
// ---------------------------------------------------------------------------
{
  const page = await newPage();
  await page.goto(
    sceneUrl({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'periodic-circle',
      quantity: 'real-imaginary-parts',
      view1d: 'ring',
      playing: false,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: {
        siteCount: 128,
        waveSpeed: 1,
        domainLength: 1,
        initialCenter: 0.5,
        gaussianWidth: 0.08,
        momentumWidth: 2,
        modeNumber: 6,
        initialPreset: 'gaussian-wavepacket',
      },
    }),
  );
  await page.waitForTimeout(2200);
  const analysis = await analyzeCanvas(page);
  await page.screenshot({ path: `${SHOTS}/quantum1d-re-im-ring.png` });
  record(
    'combined Re/Im traces distinguishable (blue + orange present)',
    analysis.bluish > 200 && analysis.orangish > 200,
    { bluePixels: analysis.bluish, orangePixels: analysis.orangish },
  );

  // Changing quantity must not reset time: play, pause, note time, switch.
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(400);
  const timeBefore = await displayTime(page);
  await page
    .getByLabel('Displayed quantity')
    .selectOption('probability-density');
  await page.waitForTimeout(200);
  const timeAfter = await displayTime(page);
  record(
    'changing displayed quantity preserves time',
    timeBefore > 0 && timeAfter === timeBefore,
    {
      timeBefore,
      timeAfter,
    },
  );
  await page.close();
}

// ---------------------------------------------------------------------------
// Section D: classical energy density visible and finite in all 5 geometries.
// ---------------------------------------------------------------------------
const energyGeometries = [
  [
    'periodic-circle',
    { ...classical1dBase, initialPreset: 'gaussian-displacement' },
  ],
  [
    'periodic-circle-fixed',
    { ...classical1dBase, initialPreset: 'gaussian-displacement' },
  ],
  [
    'fixed-interval',
    {
      ...classical1dBase,
      siteCount: 129,
      initialPreset: 'gaussian-displacement',
    },
  ],
  [
    'square-fixed',
    {
      geometry: 'square-fixed',
      size: 48,
      waveSpeed: 1,
      domainLength: 1,
      amplitude: 0.9,
      gaussianWidth: 0.08,
      initialPreset: 'central-gaussian-displacement',
    },
  ],
  [
    'torus-periodic',
    {
      geometry: 'torus-periodic',
      size: 48,
      waveSpeed: 1,
      domainLength: 1,
      amplitude: 0.9,
      gaussianWidth: 0.08,
      initialPreset: 'central-gaussian-displacement',
    },
  ],
];

for (const [geometry, config] of energyGeometries) {
  const page = await newPage();
  await page.goto(
    sceneUrl({
      v: 1,
      mode: 'classical',
      geometry,
      quantity: 'energy-density',
      playing: false,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config,
    }),
  );
  await page.waitForTimeout(2200);
  const analysis = await analyzeCanvas(page);
  const bodyText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `${SHOTS}/energy-density-${geometry}.png` });
  record(
    `energy density visible+finite (${geometry})`,
    !analysis.empty &&
      analysis.inkCount > 500 &&
      bodyText.includes('Energy density') &&
      !bodyText.includes('NaN'),
    {
      inkPixels: analysis.empty ? 0 : analysis.inkCount,
      legend: bodyText.includes('Energy density'),
      nan: bodyText.includes('NaN'),
    },
  );
  await page.close();
}

// ---------------------------------------------------------------------------
// Section E: stale-frame / reset behaviour across switches.
// ---------------------------------------------------------------------------
{
  const page = await newPage();
  await page.goto(classicalRingScene('gaussian-displacement'));
  await page.waitForTimeout(2000);
  for (let i = 0; i < 3; i += 1)
    await page.getByRole('button', { name: 'Single step' }).click();
  const advanced = await displayTime(page);

  await page.getByLabel('Field type').selectOption('quantum-one-particle');
  const afterMode = await displayTime(page);
  await page.screenshot({ path: `${SHOTS}/switch-mode-immediate.png` });
  record(
    'mode switch starts at time zero (no stale time)',
    advanced > 0 && afterMode === 0,
    { advanced, afterMode },
  );

  // The destination quantum controller defaults to playing; pause it so the
  // remaining time-zero readings are not racing live playback.
  await page.getByRole('button', { name: 'Pause' }).click();

  for (let i = 0; i < 2; i += 1)
    await page.getByRole('button', { name: 'Single step' }).click();
  await page.getByLabel('Geometry').selectOption('fixed-interval');
  const afterGeometry = await displayTime(page);
  await page.screenshot({ path: `${SHOTS}/switch-geometry-immediate.png` });
  record('geometry switch starts at time zero', afterGeometry === 0, {
    afterGeometry,
  });
  await page.getByRole('button', { name: 'Pause' }).click();

  // Preset change resets to a fresh time-zero state.
  for (let i = 0; i < 2; i += 1)
    await page.getByRole('button', { name: 'Single step' }).click();
  await page.getByLabel('Initial state').selectOption('gaussian-wavepacket');
  await page.waitForTimeout(150);
  const afterPreset = await displayTime(page);
  record('preset change resets to time zero', afterPreset === 0, {
    afterPreset,
  });

  // Size change resets too.
  for (let i = 0; i < 2; i += 1)
    await page.getByRole('button', { name: 'Single step' }).click();
  await page.getByLabel('Lattice density').selectOption('256');
  await page.waitForTimeout(150);
  const afterSize = await displayTime(page);
  record('size change resets to time zero', afterSize === 0, { afterSize });

  // Reset button: immediate fresh t=0 frame.
  for (let i = 0; i < 3; i += 1)
    await page.getByRole('button', { name: 'Single step' }).click();
  const beforeReset = await displayTime(page);
  await page.getByRole('button', { name: 'Reset' }).click();
  const afterReset = await displayTime(page);
  await page.screenshot({ path: `${SHOTS}/reset-immediate.png` });
  record(
    'reset immediately returns to time zero',
    beforeReset > 0 && afterReset === 0,
    { beforeReset, afterReset },
  );
  await page.close();
}

// 2D quantum worker reset: fresh time-zero frame without waiting on worker.
{
  const page = await newPage();
  await page.goto(
    sceneUrl({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'torus-periodic',
      quantity: 'probability-density',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: {
        size: 96,
        waveSpeed: 1,
        domainLength: 1,
        initialCenterX: 0.5,
        initialCenterY: 0.5,
        gaussianWidth: 0.1,
        momentumWidth: 1.2,
        modeNumberX: 3,
        modeNumberY: 0,
        initialPreset: 'gaussian-wavepacket',
      },
    }),
  );
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${SHOTS}/quantum2d-96-before-reset.png` });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
  const t = await displayTime(page);
  await page.screenshot({ path: `${SHOTS}/quantum2d-96-after-reset.png` });
  const stats = await page.evaluate(() => ({
    stale: window.__workerStats.stale,
    responses: window.__workerStats.responses,
  }));
  record('2D quantum reset shows time zero immediately', t === 0, {
    displayTime: t,
  });
  record(
    'no stale worker frames accepted during 2D playback',
    stats.stale === 0 || stats.responses > 0,
    stats,
  );
  await page.close();
}

// ---------------------------------------------------------------------------
// Section F: profiling the two largest 2D quantum cases (>= 10 s playback).
// ---------------------------------------------------------------------------
async function profile2D(geometry, size, shotName) {
  const page = await newPage();
  const config = {
    size,
    waveSpeed: 1,
    domainLength: 1,
    initialCenterX: 0.5,
    initialCenterY: 0.5,
    gaussianWidth: 0.1,
    momentumWidth: 1.2,
    modeNumberX: geometry === 'square-fixed' ? 2 : 3,
    modeNumberY: geometry === 'square-fixed' ? 1 : 0,
    initialPreset: 'gaussian-wavepacket',
  };
  await page.goto(
    sceneUrl({
      v: 1,
      mode: 'quantum-one-particle',
      geometry,
      quantity: 'probability-density',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config,
    }),
  );
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/${shotName}-playing.png` });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metricsBefore = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
      m.name,
      m.value,
    ]),
  );
  const statsBefore = await page.evaluate(() => {
    if (window.gc) window.gc();
    return {
      responses: window.__workerStats.responses,
      stale: window.__workerStats.stale,
      computeCount: window.__workerStats.computeMs.length,
      heap: performance.memory?.usedJSHeapSize ?? null,
    };
  });

  const frameStats = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const result = {
          frames: 0,
          longTasks: 0,
          longTaskTotalMs: 0,
          maxLongTaskMs: 0,
          gaps: [],
        };
        let observer = null;
        try {
          observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              result.longTasks += 1;
              result.longTaskTotalMs += entry.duration;
              if (entry.duration > result.maxLongTaskMs)
                result.maxLongTaskMs = entry.duration;
            }
          });
          observer.observe({ type: 'longtask' });
        } catch {
          /* longtask unsupported */
        }
        let last = performance.now();
        const start = last;
        function tick(now) {
          result.frames += 1;
          if (result.frames > 1) result.gaps.push(now - last);
          last = now;
          if (now - start < 12_000) {
            requestAnimationFrame(tick);
          } else {
            observer?.disconnect();
            result.durationMs = now - start;
            resolve(result);
          }
        }
        requestAnimationFrame(tick);
      }),
  );

  const statsAfter = await page.evaluate(() => {
    const s = window.__workerStats;
    const mean = (a) =>
      a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    if (window.gc) window.gc();
    return {
      responses: s.responses,
      stale: s.stale,
      meanComputeMs: mean(s.computeMs.slice(-500)),
      meanSnapshotMs: mean(s.snapshotMs.slice(-500)),
      meanRoundTripMs: mean(s.roundTripMs.slice(-500)),
      heap: performance.memory?.usedJSHeapSize ?? null,
    };
  });
  const metricsAfter = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
      m.name,
      m.value,
    ]),
  );
  await page.screenshot({ path: `${SHOTS}/${shotName}-after-12s.png` });
  await page.close();

  frameStats.gaps.sort((a, b) => a - b);
  const seconds = frameStats.durationMs / 1000;
  const profile = {
    case: `${geometry} ${size}x${size}`,
    seconds: Number(seconds.toFixed(1)),
    fps: Number((frameStats.frames / seconds).toFixed(1)),
    meanFrameGapMs: Number(
      (
        frameStats.gaps.reduce((a, b) => a + b, 0) / frameStats.gaps.length
      ).toFixed(2),
    ),
    p95FrameGapMs: Number(
      frameStats.gaps[Math.floor(frameStats.gaps.length * 0.95)].toFixed(2),
    ),
    maxFrameGapMs: Number(
      frameStats.gaps[frameStats.gaps.length - 1].toFixed(2),
    ),
    droppedFrames: frameStats.gaps.filter((g) => g > 33.4).length,
    longTasks: frameStats.longTasks,
    longTaskTotalMs: Number(frameStats.longTaskTotalMs.toFixed(1)),
    maxLongTaskMs: Number(frameStats.maxLongTaskMs.toFixed(1)),
    workerUpdatesPerSecond: Number(
      ((statsAfter.responses - statsBefore.responses) / seconds).toFixed(1),
    ),
    staleWorkerFrames: statsAfter.stale - statsBefore.stale,
    workerMeanComputeMs:
      statsAfter.meanComputeMs === null
        ? null
        : Number(statsAfter.meanComputeMs.toFixed(2)),
    workerMeanSnapshotMs:
      statsAfter.meanSnapshotMs === null
        ? null
        : Number(statsAfter.meanSnapshotMs.toFixed(2)),
    workerMeanRoundTripMs:
      statsAfter.meanRoundTripMs === null
        ? null
        : Number(statsAfter.meanRoundTripMs.toFixed(2)),
    mainThreadScriptMsPerSecond: Number(
      (
        ((metricsAfter.ScriptDuration - metricsBefore.ScriptDuration) * 1000) /
        seconds
      ).toFixed(1),
    ),
    mainThreadLayoutMsPerSecond: Number(
      (
        ((metricsAfter.LayoutDuration - metricsBefore.LayoutDuration) * 1000) /
        seconds
      ).toFixed(1),
    ),
    heapGrowthMB:
      statsBefore.heap !== null && statsAfter.heap !== null
        ? Number(((statsAfter.heap - statsBefore.heap) / 1e6).toFixed(2))
        : null,
  };
  record(
    `profile ${profile.case}`,
    profile.fps > 30 &&
      profile.staleWorkerFrames === 0 &&
      (profile.heapGrowthMB === null || profile.heapGrowthMB < 30),
    profile,
  );
  return profile;
}

const torusProfile = await profile2D(
  'torus-periodic',
  96,
  'quantum2d-torus-96',
);
const squareProfile = await profile2D(
  'square-fixed',
  81,
  'quantum2d-square-81',
);

// Fixed 2D boundary + standing-mode pattern screenshots for the record.
{
  const page = await newPage();
  await page.goto(
    sceneUrl({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'square-fixed',
      quantity: 'probability-density',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: {
        size: 81,
        waveSpeed: 1,
        domainLength: 1,
        initialCenterX: 0.5,
        initialCenterY: 0.5,
        gaussianWidth: 0.1,
        momentumWidth: 1.2,
        modeNumberX: 2,
        modeNumberY: 1,
        initialPreset: 'selected-normal-mode',
      },
    }),
  );
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/quantum2d-square-81-mode21-t0.png` });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/quantum2d-square-81-mode21-t1.png` });
  await page.close();
}

// Interaction responsiveness: change quantity mid-playback and measure the
// worst frame gap around the interaction.
{
  const page = await newPage();
  await page.goto(
    sceneUrl({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'torus-periodic',
      quantity: 'probability-density',
      playing: true,
      speed: 1,
      showLattice: false,
      showSprings: false,
      config: {
        size: 96,
        waveSpeed: 1,
        domainLength: 1,
        initialCenterX: 0.5,
        initialCenterY: 0.5,
        gaussianWidth: 0.1,
        momentumWidth: 1.2,
        modeNumberX: 3,
        modeNumberY: 0,
        initialPreset: 'gaussian-wavepacket',
      },
    }),
  );
  await page.waitForTimeout(2500);
  const gapPromise = page.evaluate(
    () =>
      new Promise((resolve) => {
        const gaps = [];
        let last = performance.now();
        const start = last;
        function tick(now) {
          gaps.push(now - last);
          last = now;
          if (now - start < 2500) requestAnimationFrame(tick);
          else resolve(Math.max(...gaps.slice(1)));
        }
        requestAnimationFrame(tick);
      }),
  );
  await page.getByLabel('Displayed quantity').selectOption('phase-magnitude');
  await page.waitForTimeout(400);
  await page
    .getByLabel('Displayed quantity')
    .selectOption('probability-density');
  const worstGap = await gapPromise;
  record(
    'responsive during interaction (quantity change mid-playback)',
    worstGap < 250,
    {
      worstFrameGapMs: Number(worstGap.toFixed(1)),
    },
  );
  await page.close();
}

await browser.close();

writeFileSync(
  `${SHOTS}/release-gate-results.json`,
  JSON.stringify(
    { results, torusProfile, squareProfile, consoleErrors },
    null,
    2,
  ),
);

console.log('\n================ SUMMARY ================');
console.log(`checks: ${results.length}, failures: ${failures.length}`);
if (consoleErrors.length > 0) {
  console.log('CONSOLE ERRORS:');
  for (const error of consoleErrors) console.log(` - ${error}`);
}
if (failures.length > 0 || consoleErrors.length > 0) process.exitCode = 1;
