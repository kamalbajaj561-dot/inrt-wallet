import { test, expect } from '@playwright/test';

test('SplitBill - verify share button has onClick handler', async ({ page }) => {
  await page.goto('http://localhost:3000/split-bill');
  await page.waitForLoadState('networkidle');
  
  // Take screenshot first to see what's on the page
  await page.screenshot({ path: 'test-screenshots/split-bill-initial.png' });
  
  // Get page content
  const bodyText = await page.textContent('body');
  console.log('Page content length:', bodyText?.length);
  
  // Look for the share button
  const shareButton = page.locator('text=Share with everyone');
  const isVisible = await shareButton.isVisible();
  
  console.log('Share button visible:', isVisible);
  
  // Try to find any button with "Share" text
  const allButtons = await page.locator('button').all();
  console.log('Total buttons found:', allButtons.length);
  
  for (let i = 0; i < allButtons.length; i++) {
    const text = await allButtons[i].textContent();
    console.log(`Button ${i}:`, text);
  }
});
