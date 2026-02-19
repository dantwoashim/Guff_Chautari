import { expect, test } from '@playwright/test';

test('missing BYOK key blocks pipeline with actionable error', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.evaluate(() => {
    window.localStorage.removeItem('ashim.byok.keys.v1');
    window.sessionStorage.removeItem('ashim.byok.runtime.gemini');
  });
  await page.reload();
  await page.getByTestId('pipeline-run-button').click();

  await expect(page.getByTestId('pipeline-error')).toContainText('Missing BYOK key');
});
