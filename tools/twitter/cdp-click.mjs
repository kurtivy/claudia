#!/usr/bin/env node
// CDP-level click on a Twitter Follow button using Input.dispatchMouseEvent
// Usage: node cdp-click.mjs <cdp-port> <data-testid>
// Example: node cdp-click.mjs 9871 "2018369829573476352-follow"

import { createConnection } from 'net';
import { get } from 'http';

const [,, cdpPort, testId] = process.argv;
if (!cdpPort || !testId) {
  console.error('Usage: node cdp-click.mjs <cdp-port> <data-testid>');
  process.exit(1);
}

// Get the WebSocket URL for the first page tab
function getWsUrl() {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${cdpPort}/json`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const tabs = JSON.parse(data);
        const page = tabs.find(t => t.type === 'page' && !t.url.startsWith('about:') && !t.url.startsWith('blob:') && !t.url.includes('sw.js'));
        if (!page) reject(new Error('No page tab found'));
        else resolve(page.webSocketDebuggerUrl);
      });
    }).on('error', reject);
  });
}

// Minimal WebSocket client (no external deps)
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
        const opcode = byte1 & 0x0f;
        if (opcode === 1) { // text
          try {
            const msg = JSON.parse(payload.toString());
            if (msg.id !== undefined && pending.has(msg.id)) {
              pending.get(msg.id)(msg);
              pending.delete(msg.id);
            }
          } catch(e) {}
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
      return new Promise(resolve => {
        const id = ++msgId;
        pending.set(id, resolve);
        sendFrame({ id, method, params });
      });
    }

    sock.on('error', reject);
    // Wait a tick for upgrade
    setTimeout(() => resolve({ send, close: () => sock.end() }), 300);
  });
}

async function main() {
  const wsUrl = await getWsUrl();
  console.log('CDP WebSocket:', wsUrl);

  const ws = await connectWs(wsUrl);

  // Get button coordinates
  const evalResp = await ws.send('Runtime.evaluate', {
    expression: `(function(){
      var b = document.querySelector('[data-testid="${testId}"]');
      if (!b) return JSON.stringify({error: 'not found'});
      b.scrollIntoView({block: 'center'});
      var r = b.getBoundingClientRect();
      return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height, text: b.textContent.trim()});
    })()`,
    returnByValue: true
  });

  const coords = JSON.parse(evalResp.result.result.value);
  if (coords.error) {
    console.error('Button not found:', coords.error);
    process.exit(1);
  }
  console.log('Button:', coords);

  // Wait for scrollIntoView to settle
  await new Promise(r => setTimeout(r, 500));

  // Re-get coords after scroll
  const evalResp2 = await ws.send('Runtime.evaluate', {
    expression: `(function(){
      var b = document.querySelector('[data-testid="${testId}"]');
      var r = b.getBoundingClientRect();
      return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
    })()`,
    returnByValue: true
  });
  const finalCoords = JSON.parse(evalResp2.result.result.value);
  const x = finalCoords.x;
  const y = finalCoords.y;
  console.log(`Clicking at (${x}, ${y})`);

  // CDP Input.dispatchMouseEvent - the real deal
  // 1. Move mouse to button
  const moveResp = await ws.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse'
  });
  console.log('mouseMoved:', moveResp.result ? 'ok' : moveResp);

  await new Promise(r => setTimeout(r, 100));

  // 2. Press
  const pressResp = await ws.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse'
  });
  console.log('mousePressed:', pressResp.result ? 'ok' : pressResp);

  await new Promise(r => setTimeout(r, 50));

  // 3. Release
  const releaseResp = await ws.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse'
  });
  console.log('mouseReleased:', releaseResp.result ? 'ok' : releaseResp);

  // Wait for Twitter to process
  await new Promise(r => setTimeout(r, 3000));

  // Check result
  const checkResp = await ws.send('Runtime.evaluate', {
    expression: `(function(){
      var follow = document.querySelector('[data-testid="${testId}"]');
      var unfollowId = "${testId}".replace("-follow", "-unfollow");
      var unfollow = document.querySelector('[data-testid="' + unfollowId + '"]');
      return JSON.stringify({
        followButton: follow ? follow.textContent.trim() : 'NOT FOUND',
        unfollowButton: unfollow ? unfollow.textContent.trim() : 'NOT FOUND',
        followTestId: follow ? follow.dataset.testid : null,
        unfollowTestId: unfollow ? unfollow.dataset.testid : null
      });
    })()`,
    returnByValue: true
  });
  const result = JSON.parse(checkResp.result.result.value);
  console.log('Result:', JSON.stringify(result, null, 2));

  if (result.unfollowButton !== 'NOT FOUND') {
    console.log('SUCCESS: Follow button changed to unfollow state!');
  } else if (result.followButton === 'NOT FOUND' && result.unfollowButton === 'NOT FOUND') {
    console.log('POSSIBLE SUCCESS: Both buttons gone (page may have changed)');
  } else {
    console.log('FAILED: Button still shows "Follow"');
  }

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
