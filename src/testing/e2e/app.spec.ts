import { expect, test } from '@playwright/test';

test('loads the application shell', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: /periodic lattice visualisation with classical and one-particle views/i,
    }),
  ).toBeVisible();

  await page.getByLabel('Geometry').selectOption('fixed-interval');
  await expect(page.getByText(/1d fixed-end classical lattice/i)).toBeVisible();

  await page.getByLabel(/interpretation mode/i).selectOption('quantum-one-particle');
  await expect(page.getByText(/free-field one-particle pedagogical/i)).toBeVisible();
});
