#!/usr/bin/env node
// twitter-login.mjs — Log into Twitter via CDP using stored credentials
// Usage: node twitter-login.mjs
// Reads credentials from ~/.claudia/secrets/twitter.json

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || 'C:/Users/kurtw';
const CREDS_FILE = join(HOME, '.claudia', 'secrets', 'twitter.json');

async function main() {
  // Load credentials
  let creds;
  try {
    creds = JSON.parse(readFileSync(CREDS_FILE, 'utf8'));
  } catch (e) {
    console.error('Cannot read credentials from', CREDS_FILE);
    process.exit(1);
  }

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('No browser contexts found');
    process.exit(1);
  }

  // Find the x.com tab
  let page = contexts[0].pages().find(p => p.url().includes('x.com'));
  if (!page) {
    page = await contexts[0].newPage();
    await page.goto('https://x.com/i/flow/login');
  }

  // Check if already logged in
  if (!page.url().includes('login') && !page.url().includes('flow')) {
    console.log('Already logged in at', page.url());
    await browser.close();
    return;
  }

  console.log('On login page:', page.url());

  // Step 1: Enter username
  try {
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
    await page.click('input[autocomplete="username"]');
    await page.keyboard.type(creds.username, { delay: 50 });
    console.log('Username typed');

    // Click Next
    const nextBtn = await page.$('button:has-text("Next")');
    if (nextBtn) {
      await nextBtn.click();
      console.log('Clicked Next');
    } else {
      // Try pressing Enter
      await page.keyboard.press('Enter');
      console.log('Pressed Enter');
    }

    await page.waitForTimeout(2000);
  } catch (e) {
    console.error('Username step failed:', e.message);
    await browser.close();
    process.exit(1);
  }

  // Step 2: Check for unusual activity challenge (email/phone verification)
  const challengeInput = await page.$('input[data-testid="ocfEnterTextTextInput"]');
  if (challengeInput) {
    console.log('Challenge detected (unusual activity). May need email or phone.');
    // Try typing the username as the challenge response (Twitter sometimes asks for this)
    await challengeInput.click();
    await page.keyboard.type(creds.username, { delay: 50 });
    const challengeNext = await page.$('button[data-testid="ocfEnterTextNextButton"]');
    if (challengeNext) await challengeNext.click();
    await page.waitForTimeout(2000);
    console.log('Challenge response submitted');
  }

  // Step 3: Enter password
  try {
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.click('input[type="password"]');
    await page.keyboard.type(creds.password, { delay: 30 });
    console.log('Password typed');

    // Click Log in
    const loginBtn = await page.$('button[data-testid="LoginForm_Login_Button"]');
    if (loginBtn) {
      await loginBtn.click();
      console.log('Clicked Log in');
    } else {
      await page.keyboard.press('Enter');
      console.log('Pressed Enter');
    }

    await page.waitForTimeout(3000);
  } catch (e) {
    console.error('Password step failed:', e.message);
    await browser.close();
    process.exit(1);
  }

  // Check result
  const finalUrl = page.url();
  const title = await page.title();
  console.log('Final URL:', finalUrl);
  console.log('Title:', title);

  if (finalUrl.includes('login') || finalUrl.includes('flow')) {
    console.error('Login may have failed — still on login/flow page');
  } else {
    console.log('SUCCESS — logged into Twitter');
  }

  await browser.close();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
