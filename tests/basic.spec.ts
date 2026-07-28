import { test, expect } from '@playwright/test';

test('basic browser test - can navigate to app', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  // Take a screenshot for verification
  await page.screenshot({ path: 'test-screenshots/homepage.png' });
  
  // Check if page loaded
  const title = await page.title();
  console.log('Page title:', title);
  
  // Check if any content is visible
  const bodyText = await page.textContent('body');
  console.log('Body contains text:', bodyText?.length || 0, 'characters');
  
  expect(bodyText?.length).toBeGreaterThan(0);
});
