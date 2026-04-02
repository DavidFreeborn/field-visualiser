import { expect, test } from '@playwright/test';

test('loads the application shell', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: /scientific lattice-field visualisation, built in phases/i,
    }),
  ).toBeVisible();
});
