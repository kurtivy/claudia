// Claudia Mail — Tracking Routes (Public, no auth)
// Open pixel endpoint + click redirect endpoint

import express from 'express';
import { run, get } from '../db.mjs';
import { getPixelBuffer } from '../lib/tracking.mjs';

const router = express.Router();

// GET /api/t/:trackingId.png — Open tracking pixel
// Returns 1x1 transparent PNG, logs the open
router.get('/t/:trackingId.png', (req, res) => {
  try {
    const trackingId = req.params.trackingId;

    // Log the open (fire-and-forget, don't block response)
    const send = get('SELECT id, campaign_id, opened_at FROM sends WHERE tracking_id = ?', trackingId);
    if (send && !send.opened_at) {
      run(
        `UPDATE sends SET opened_at = datetime('now') WHERE id = ?`,
        send.id
      );
      run(
        'UPDATE campaigns SET opened = opened + 1 WHERE id = ?',
        send.campaign_id
      );
    }
  } catch (err) {
    // Don't fail the response for tracking errors
    console.error(`[tracking] Open pixel error for ${req.params.trackingId}: ${err.message}`);
  }

  // Always return the pixel
  const pixel = getPixelBuffer();
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': pixel.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(pixel);
});

// GET /api/c/:trackingId/:encodedUrl — Click redirect
// Logs the click, redirects to original URL
router.get('/c/:trackingId/:encodedUrl', (req, res) => {
  try {
    const { trackingId, encodedUrl } = req.params;

    // Decode the original URL
    let originalUrl;
    try {
      originalUrl = Buffer.from(encodedUrl, 'base64url').toString('utf8');
    } catch {
      originalUrl = Buffer.from(encodedUrl, 'base64').toString('utf8');
    }

    // Validate URL
    if (!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://')) {
      return res.status(400).send('Invalid redirect URL');
    }

    // Log the click
    const send = get('SELECT id, campaign_id, clicked_at FROM sends WHERE tracking_id = ?', trackingId);
    if (send && !send.clicked_at) {
      run(
        `UPDATE sends SET clicked_at = datetime('now') WHERE id = ?`,
        send.id
      );
      run(
        'UPDATE campaigns SET clicked = clicked + 1 WHERE id = ?',
        send.campaign_id
      );
    }

    // Also count as an open if not already
    if (send && !send.opened_at) {
      run(`UPDATE sends SET opened_at = datetime('now') WHERE id = ?`, send.id);
      // Check if we already counted this open
      const freshSend = get('SELECT opened_at FROM sends WHERE id = ?', send.id);
      if (freshSend) {
        run('UPDATE campaigns SET opened = opened + 1 WHERE id = ?', send.campaign_id);
      }
    }

    // 302 redirect to original URL
    res.redirect(302, originalUrl);
  } catch (err) {
    console.error(`[tracking] Click redirect error: ${err.message}`);
    res.status(500).send('Redirect error');
  }
});

export default router;
