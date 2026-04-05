#!/usr/bin/env node
// Follow a Twitter user via CDP Input.dispatchMouseEvent
// Usage: node twitter-follow.mjs <username>
// Requires PinchTab twitter instance running (pinchtab-twitter.sh start)
// Returns exit code 0 on success, 1 on failure, 2 on rate limit

import { createConnection } from 'net';
import { get } from 'http';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const [,, username] = process.argv;
if (!username) {
  console.error('Usage: node twitter-follow.mjs <username>');
  process.exit(1);
}

const cleanUsername = username.replace(/^@/, '');

// Read PinchTab port
let ptPort;
try {
  ptPort = readFileSync('/tmp/pinchtab-twitter-port', 'utf8').trim();
} catch {
  console.error('ERROR: No PinchTab twitter instance running. Run pinchtab-twitter.sh start first.');
  process.exit(1);
}

// Get CDP port from Chrome process
function getCdpPort() {
  return new Promise((resolve, reject) => {
    // execSync imported at top
    try {
      const ps = execSync('ps aux', { encoding: 'utf8' });
      const lines = ps.split('\n').filter(l => l.includes('remote-debugging-port') && l.includes('prof_7352f353'));
      if (lines.length === 0) {
        // Fallback: find any Chrome with twitter profile
        const all = ps.split('\n').filter(l => l.includes('remote-debugging-port'));
        for (const line of all) {
          const m = line.match(/--remote-debugging-port=(\d+)/);
          if (m && line.includes('prof_7352f353')) {
            resolve(parseInt(m[1]));
            return;
          }
        }
        // Second fallback: PinchTab port + 1
        resolve(parseInt(ptPort) + 1);
      } else {
        const m = lines[0].match(/--remote-debugging-port=(\d+)/);
        resolve(m ? parseInt(m[1]) : parseInt(ptPort) + 1);
      }
    } catch {
      resolve(parseInt(ptPort) + 1);
    }
  });
}

function getWsUrl(cdpPort) {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${cdpPort}/json`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const tabs = JSON.parse(data);
        const page = tabs.find(t => t.type === 'page' && t.url.includes('x.com'));
        if (!page) reject(new Error('No x.com tab found'));
        else resolve(page.webSocketDebuggerUrl);
      });
    }).on('error', reject);
  });
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const key = Buffer.from(Math.random().toString()).toString('base64');
    const sock = createConnection({ host: parsed.hostname, port: parseInt(parsed.port) }, () => {
      sock.write(
        `GET ${parsed.pathname} HTTP/1.1\r\n` +
        `Host: ${parsed.host}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`
      );
    });

    let upgraded = false;
    let buffer = Buffer.alloc(0);
    const pending = new Map();
    let msgId = 0;

    function processFrames() {
      while (buffer.length >= 2) {
        const byte1 = buffer[0];
        const byte2 = buffer[1];
        const masked = (byte2 & 0x80) !== 0;
        let payloadLen = byte2 & 0x7f;
        let offset = 2;
        if (payloadLen === 126) {
          if (buffer.length < 4) return;
          payloadLen = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buffer.length < 10) return;
          payloadLen = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        if (masked) offset += 4;
        if (buffer.length < offset + payloadLen) return;
        let payload = buffer.slice(offset, offset + payloadLen);
        if (masked) {
          const mask = buffer.slice(offset - 4, offset);
          for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        }
        buffer = buffer.slice(offset + payloadLen);
        if ((byte1 & 0x0f) === 1) {
          try {
            const msg = JSON.parse(payload.toString());
            if (msg.id !== undefined && pending.has(msg.id)) {
              pending.get(msg.id)(msg);
              pending.delete(msg.id);
            }
          } catch {}
        }
      }
    }

    sock.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const idx = buffer.indexOf('\r\n\r\n');
        if (idx === -1) return;
        upgraded = true;
        buffer = buffer.slice(idx + 4);
      }
      processFrames();
    });

    function sendFrame(data) {
      const payload = Buffer.from(JSON.stringify(data));
      const mask = Buffer.from([Math.random()*256|0, Math.random()*256|0, Math.random()*256|0, Math.random()*256|0]);
      let header;
      if (payload.length < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81;
        header[1] = 0x80 | payload.length;
      } else if (payload.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(payload.length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
      }
      const masked = Buffer.from(payload);
      for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
      sock.write(Buffer.concat([header, mask, masked]));
    }

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++msgId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout')); }, 15000);
        pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
        sendFrame({ id, method, params });
      });
    }

    sock.on('error', reject);
    setTimeout(() => resolve({ send, close: () => sock.end() }), 300);
  });
}

function evalJs(ws, expr) {
  return ws.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false })
    .then(r => r.result?.result?.value);
}

async function main() {
  const cdpPort = await getCdpPort();

  // Step 1: Navigate to profile using PinchTab (handles tab management)
  // execSync imported at top
  console.log(`Navigating to @${cleanUsername}...`);
  execSync(`PINCHTAB_URL=http://127.0.0.1:${ptPort} /home/node/.claudia/bin/pinchtab nav https://x.com/${cleanUsername}`, { encoding: 'utf8', timeout: 15000 });

  // Wait for page load
  await new Promise(r => setTimeout(r, 4000));

  // Get the WebSocket URL for the current page
  const wsUrl = await getWsUrl(cdpPort);
  const ws = await connectWs(wsUrl);

  // Step 2: Install network intercept to capture Follow API response
  await evalJs(ws, `(function(){
    window.__twFollowResult = null;
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m, u) { this.__url = u; this.__method = m; return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function(body) {
      var self = this;
      if (self.__url && (self.__url.includes('friendships/create') || self.__url.includes('friendships/destroy'))) {
        self.addEventListener('load', function() {
          window.__twFollowResult = { url: self.__url, status: self.status, response: self.responseText ? self.responseText.substring(0, 2000) : null };
        });
      }
      return origSend.apply(this, arguments);
    };
    return 'ok';
  })()`);

  // Step 3: Find the Follow button
  const buttonInfo = await evalJs(ws, `(function(){
    var buttons = document.querySelectorAll('[data-testid]');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (b.dataset.testid.endsWith('-follow') && b.tagName === 'BUTTON') {
        // Check this is the profile Follow button (not sidebar suggestions)
        var text = b.textContent.trim();
        if (text === 'Follow') {
          b.scrollIntoView({block: 'center'});
          var r = b.getBoundingClientRect();
          return JSON.stringify({found: true, testid: b.dataset.testid, x: r.x + r.width/2, y: r.y + r.height/2, text: text});
        }
      }
    }
    // Check if already following
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (b.dataset.testid.endsWith('-unfollow') && b.tagName === 'BUTTON') {
        return JSON.stringify({found: false, alreadyFollowing: true, testid: b.dataset.testid});
      }
    }
    return JSON.stringify({found: false, alreadyFollowing: false});
  })()`);

  const info = JSON.parse(buttonInfo);

  if (info.alreadyFollowing) {
    console.log(`Already following @${cleanUsername}`);
    ws.close();
    process.exit(0);
  }

  if (!info.found) {
    console.error(`No Follow button found for @${cleanUsername}`);
    ws.close();
    process.exit(1);
  }

  // Wait for scroll
  await new Promise(r => setTimeout(r, 500));

  // Re-get coordinates after scroll
  const coords = JSON.parse(await evalJs(ws, `(function(){
    var b = document.querySelector('[data-testid="${info.testid}"]');
    var r = b.getBoundingClientRect();
    return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
  })()`));

  console.log(`Follow button at (${coords.x}, ${coords.y})`);

  // Step 4: CDP click
  await ws.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: coords.x, y: coords.y, button: 'none', buttons: 0, pointerType: 'mouse' });
  await new Promise(r => setTimeout(r, 100));
  await ws.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
  await new Promise(r => setTimeout(r, 50));
  await ws.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });

  console.log('Click dispatched, waiting for API response...');

  // Step 5: Wait for API response
  await new Promise(r => setTimeout(r, 3000));

  const apiResult = await evalJs(ws, 'JSON.stringify(window.__twFollowResult)');
  const result = apiResult ? JSON.parse(apiResult) : null;

  if (!result) {
    console.error('No API call detected — click may not have registered');
    ws.close();
    process.exit(1);
  }

  console.log(`API response: ${result.status}`);

  if (result.status === 200) {
    // Verify UI updated
    const verify = await evalJs(ws, `(function(){
      var unfollowId = "${info.testid}".replace("-follow", "-unfollow");
      var unfollow = document.querySelector('[data-testid="' + unfollowId + '"]');
      return unfollow ? 'FOLLOWING' : 'NOT_UPDATED';
    })()`);

    if (verify === 'FOLLOWING') {
      console.log(`SUCCESS: Now following @${cleanUsername}`);
      ws.close();
      process.exit(0);
    } else {
      console.log(`API succeeded but UI not updated — likely followed (refresh to confirm)`);
      ws.close();
      process.exit(0);
    }
  } else if (result.status === 403) {
    const resp = JSON.parse(result.response || '{}');
    const errorCode = resp.errors?.[0]?.code;
    const errorMsg = resp.errors?.[0]?.message;
    if (errorCode === 161) {
      console.error(`RATE LIMITED: ${errorMsg}`);
      console.error('Twitter has temporarily blocked follows. Wait 24-48 hours.');
      ws.close();
      process.exit(2);
    } else {
      console.error(`API error ${errorCode}: ${errorMsg}`);
      ws.close();
      process.exit(1);
    }
  } else {
    console.error(`Unexpected API status: ${result.status}`);
    console.error(result.response?.substring(0, 500));
    ws.close();
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
