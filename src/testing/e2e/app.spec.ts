import { expect, test } from '@playwright/test';

test('loads the application shell', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: /visualising free fields/i,
    }),
  ).toBeVisible();

  await page.getByLabel('Geometry').selectOption('square-fixed');
  await expect(
    page.getByText(/fixed zero boundaries on all edges/i),
  ).toBeVisible();

  await page.getByLabel('Geometry').selectOption('fixed-interval');
  await expect(
    page.getByText(
      /classical nearest-neighbour line with fixed zero endpoints/i,
    ),
  ).toBeVisible();

  await page.getByLabel('Geometry').selectOption('periodic-circle-fixed');
  await expect(
    page.getByText(/shown on a fixed circular domain with color encoding/i),
  ).toBeVisible();

  await page.getByLabel(/field type/i).selectOption('quantum-one-particle');
  await expect(
    page.getByText(
      /square-root lattice quantum model on the periodic lattice, shown on a fixed circular domain with color encoding/i,
    ),
  ).toBeVisible();

  await page.getByLabel('Geometry').selectOption('torus-periodic');
  await expect(
    page.getByText(
      /exact separable phase evolution in a 2d periodic normal-mode basis/i,
    ),
  ).toBeVisible();
});

test('opens periodic 1D as a circle and retains energy density across geometry changes', async ({
  page,
}) => {
  await page.goto('/');

  // The circle is the default representation for periodic geometries.
  await expect(page.getByLabel('1D representation')).toHaveValue('ring');

  // Select energy on the ring, hop to the 2D torus and back to the fixed
  // ring: the quantity must survive both transitions.
  await page.getByLabel('Quantity').selectOption('energy-density');
  await page.getByLabel('Geometry').selectOption('torus-periodic');
  await expect(page.getByLabel('Quantity')).toHaveValue('energy-density');

  await page.getByLabel('Geometry').selectOption('periodic-circle-fixed');
  await expect(page.getByLabel('Quantity')).toHaveValue('energy-density');
});

test('restores a shared scene from the URL state', async ({ page }) => {
  const sharedScene = encodeURIComponent(
    JSON.stringify({
      v: 1,
      mode: 'quantum-one-particle',
      geometry: 'fixed-interval',
      quantity: 'probability-density',
      playing: false,
      speed: 1.2,
      showLattice: true,
      showSprings: false,
      config: {
        siteCount: 129,
        waveSpeed: 1,
        domainLength: 1,
        initialCenter: 0.5,
        gaussianWidth: 0.08,
        momentumWidth: 2,
        modeNumber: 6,
        initialPreset: 'selected-normal-mode',
      },
    }),
  );

  await page.goto(`/?scene=${sharedScene}`);

  await expect(
    page.getByText(
      /square-root lattice quantum model on a fixed-end interval/i,
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Geometry')).toHaveValue('fixed-interval');
  await expect(page.getByLabel(/field type/i)).toHaveValue(
    'quantum-one-particle',
  );
  await expect(page.getByRole('button', { name: /^play$/i })).toBeVisible();
});
