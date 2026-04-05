#!/usr/bin/env node
// boot-check.mjs — Run at session start to verify all services are healthy.
// Checks: mail service, last campaign stats.
// Usage: node boot-check.mjs [--telegram] [--chat-id=ID]
//
// Exit codes: 0 = all green, 1 = issues found, 2 = script error

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync, spawn } from 'node:child_process';

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDIA_DIR = join(HOME, '.claudia');

let gatewayToken = '';
try {
  const cfg = JSON.parse(readFileSync(join(CLAUDIA_DIR, 'claudia.json'), 'utf8'));
  gatewayToken = cfg.gateway?.auth?.token || cfg.gateway?.token || '';
} catch {}

const MAIL_API = 'http://localhost:18791/api';
const BOT_TOKEN = '8307181118:AAEoJG0S20FOan9fkicl0IGDO2Ab0Tb4hq8';
const DEFAULT_CHAT_ID = '1578553327';

const args = process.argv.slice(2);
const sendTelegram = args.includes('--telegram');
let chatId = DEFAULT_CHAT_ID;
for (const a of args) {
  if (a.startsWith('--chat-id=')) chatId = a.split('=')[1];
}

async function probe(url, headers = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: err.message };
  }
}

function getMailPid() {
  try {
    const out = execSync(
      'powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 18791 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess"',
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    return out ? parseInt(out) : null;
  } catch { return null; }
}

function getProcessStartTime(pid) {
  try {
    const out = execSync(
      `powershell.exe -NoProfile -Command "(Get-Process -Id ${pid}).StartTime.ToString('yyyy-MM-ddTHH:mm:ss')"`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    return out ? new Date(out) : null;
  } catch { return null; }
}

function restartMailService() {
  const pid = getMailPid();
  if (pid) {
    try { execSync(`powershell.exe -NoProfile -Command "Stop-Process -Id ${pid} -Force"`, { timeout: 5000 }); } catch {}
    // Wait for port to free
    execSync('powershell.exe -NoProfile -Command "Start-Sleep -Seconds 2"', { timeout: 10000 });
  }
  const serverPath = join(CLAUDIA_DIR, 'tools', 'email', 'mail-service', 'server.mjs');
  const workDir = join(CLAUDIA_DIR, 'tools', 'email', 'mail-service');
  spawn('node', [serverPath], { cwd: workDir, detached: true, stdio: 'ignore' }).unref();
  // Wait for startup
  execSync('powershell.exe -NoProfile -Command "Start-Sleep -Seconds 3"', { timeout: 10000 });
  return getMailPid();
}

async function checkMailService() {
  const result = { name: 'Mail Service', status: 'down', details: '' };
  const health = await probe(`${MAIL_API}/campaigns`, { 'Authorization': `Bearer ${gatewayToken}` });
  if (!health.ok) {
    // AUTO-FIX: service down, try to start it
    console.log('[AUTO-FIX] Mail service down. Starting...');
    const newPid = restartMailService();
    if (newPid) {
      result.status = 'up';
      result.details = `Auto-started (PID ${newPid}). Was down.`;
      return result;
    }
    result.details = (health.error || `HTTP ${health.status}`) + ' — auto-start FAILED';
    return result;
  }

  // Check for stale process (running >12h = likely stale config)
  const pid = getMailPid();
  if (pid) {
    const started = getProcessStartTime(pid);
    if (started) {
      const hoursRunning = (Date.now() - started.getTime()) / 3600000;
      if (hoursRunning > 12) {
        console.log(`[AUTO-FIX] Mail service stale (PID ${pid}, ${hoursRunning.toFixed(1)}h). Restarting...`);
        const newPid = restartMailService();
        if (newPid) {
          result.status = 'up';
          result.details = `Auto-restarted (old PID ${pid} ran ${hoursRunning.toFixed(1)}h, new PID ${newPid})`;
          return result;
        }
      }
    }
  }

  result.status = 'up';
  const campaigns = health.data?.campaigns || health.data || [];

  // Last 24h stats — normalize date formats for comparison
  const cutoffDate = new Date(Date.now() - 86400000);
  const recent = campaigns.filter(c => {
    if (!c.created_at) return false;
    const d = new Date(c.created_at.replace(' ', 'T') + (c.created_at.includes('Z') ? '' : 'Z'));
    return d >= cutoffDate;
  });
  const sent = recent.reduce((s, c) => s + (c.sent || 0), 0);
  const failed = recent.reduce((s, c) => s + (c.failed || 0), 0);
  const opened = recent.reduce((s, c) => s + (c.opened || 0), 0);
  const total = sent + failed;
  const failRate = total > 0 ? ((failed / total) * 100).toFixed(1) : '0';

  result.details = `24h: ${sent} sent, ${failed} failed (${failRate}%), ${opened} opens`;
  if (parseFloat(failRate) > 30) result.status = 'degraded';
  if (sent === 0 && recent.length > 0) result.status = 'degraded';

  return result;
}

async function sendToTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
}


async function launchDebugProfileChrome() {
  const debugDir = join(HOME, 'AppData', 'Local', 'Google', 'Chrome', 'Debug Profile');
  try {
    execSync(
      `powershell.exe -NoProfile -Command "Start-Process 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' -ArgumentList '--remote-debugging-port=9222','--remote-allow-origins=*','--user-data-dir=\\"${debugDir.replace(/\//g, '\\\\')}\\\"','--new-window','--restore-last-session'"`,
      { timeout: 10000 }
    );
    // Wait for Chrome to start
    execSync('powershell.exe -NoProfile -Command "Start-Sleep -Seconds 8"', { timeout: 15000 });
    const check = await probe('http://localhost:9222/json/version', {}, 3000);
    return check.ok;
  } catch { return false; }
}

async function checkTwitterAuth() {
  // Check if any x.com tab is on the login page
  try {
    const tabsRes = await fetch('http://localhost:9222/json', { signal: AbortSignal.timeout(3000) });
    const tabs = await tabsRes.json();
    const xTabs = tabs.filter(t => t.url.includes('x.com'));
    if (xTabs.length === 0) return 'no-tab';
    const onLogin = xTabs.some(t => t.url.includes('login') || t.url.includes('flow'));
    if (onLogin) return 'expired';
    return 'ok';
  } catch { return 'unknown'; }
}

async function autoLoginTwitter() {
  const loginScript = join(CLAUDIA_DIR, 'tools', 'browser', 'twitter-login.mjs');
  try {
    execSync(`node "${loginScript}"`, { encoding: 'utf8', timeout: 30000, cwd: join(CLAUDIA_DIR, 'tools', 'browser') });
    return true;
  } catch { return false; }
}

async function checkChromeCDP() {
  const result = { name: 'Chrome CDP', status: 'down', details: '' };
  let cdp = await probe('http://localhost:9222/json/version', {}, 3000);

  // AUTO-FIX: Chrome not running, launch Debug Profile
  if (!cdp.ok) {
    console.log('[AUTO-FIX] Chrome CDP down. Launching Debug Profile Chrome...');
    const launched = await launchDebugProfileChrome();
    if (launched) {
      cdp = await probe('http://localhost:9222/json/version', {}, 3000);
      if (cdp.ok) {
        result.status = 'up';
        result.details = `Auto-launched Debug Profile. ${cdp.data?.['Browser'] || 'Chrome'} on port 9222`;
      } else {
        result.details = 'Auto-launch attempted but CDP still not responding';
        return result;
      }
    } else {
      result.details = 'Port 9222 not responding. Auto-launch failed. Start Chrome manually.';
      return result;
    }
  } else {
    result.status = 'up';
    result.details = `Chrome ${cdp.data?.['Browser'] || 'connected'} on port 9222`;
  }

  // Check Twitter auth
  const twitterAuth = await checkTwitterAuth();
  if (twitterAuth === 'expired') {
    console.log('[AUTO-FIX] Twitter session expired. Attempting auto-login...');
    const loggedIn = await autoLoginTwitter();
    if (loggedIn) {
      result.details += ' | Twitter: auto-logged in';
    } else {
      result.details += ' | Twitter: login FAILED (check secrets/twitter.json)';
      result.status = 'degraded';
    }
  } else if (twitterAuth === 'ok') {
    result.details += ' | Twitter: authenticated';
  } else if (twitterAuth === 'no-tab') {
    result.details += ' | Twitter: no tab open';
  }

  return result;
}

async function checkSuperteamBounties() {
  const result = { name: 'Superteam Bounties', status: 'up', details: '' };
  try {
    const monitorPath = join(CLAUDIA_DIR, 'tools', 'earning', 'superteam-monitor.mjs');
    const out = execSync(`node "${monitorPath}" --json`, { encoding: 'utf8', timeout: 15000, cwd: join(CLAUDIA_DIR, 'tools', 'earning') });
    const data = JSON.parse(out);
    result.details = `${data.eligible} agent-eligible / ${data.total} open`;
    if (data.new > 0) {
      result.details += ` | ${data.new} NEW`;
      result.status = 'degraded'; // flag as notable so it shows in output
    }
  } catch (err) {
    result.status = 'degraded';
    result.details = `Monitor failed: ${err.message.split('\n')[0]}`;
  }
  return result;
}

async function main() {
  const checks = await Promise.all([
    checkMailService(),
    checkChromeCDP(),
  ]);

  const issues = checks.filter(c => c.status !== 'up' && c.status !== 'likely up' && c.status !== 'fixed');
  const degraded = checks.filter(c => c.status === 'degraded');
  const fixed = checks.filter(c => c.status === 'fixed');
  const allGood = issues.length === 0 && degraded.length === 0;

  // Console output
  console.log('Boot Diagnostics');
  console.log('='.repeat(60));
  for (const c of checks) {
    const icon = c.status === 'up' || c.status === 'likely up' ? 'OK' :
                 c.status === 'degraded' ? 'WARN' : 'FAIL';
    console.log(`[${icon}] ${c.name}: ${c.status} -- ${c.details}`);
  }
  console.log('='.repeat(60));
  console.log(allGood ? 'All systems nominal.' : `${issues.length + degraded.length} issue(s) found.`);

  // Telegram alert if issues and flag set
  if (!allGood && sendTelegram) {
    const lines = [
      '<b>Boot Diagnostics</b>',
      ...checks.map(c => {
        const icon = c.status === 'up' || c.status === 'likely up' ? '✅' :
                     c.status === 'degraded' ? '⚠️' : '❌';
        return `${icon} ${c.name}: ${c.details}`;
      }),
    ];
    await sendToTelegram(lines.join('\n'));
  }

  process.exit(allGood ? 0 : 1);
}

main().catch(err => {
  console.error(`Boot check failed: ${err.message}`);
  process.exit(2);
});
