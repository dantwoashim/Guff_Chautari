import { expect, test } from '@playwright/test';

test('conversation persists across reload', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.evaluate(() => {
    window.localStorage.removeItem('ashim.e2e.smoke.conversation.v1');
    window.localStorage.removeItem('ashim.byok.keys.v1');
    window.sessionStorage.removeItem('ashim.byok.runtime.gemini');
  });
  await page.reload();

  const composer = page.getByTestId('chat-composer-input');
  await expect(composer).toBeVisible();
  await composer.fill('playwright persistence smoke');
  await composer.press('Enter');

  await expect(page.getByText('playwright persistence smoke')).toBeVisible();
  await page.reload();
  await expect(page.getByText('playwright persistence smoke')).toBeVisible();
});
