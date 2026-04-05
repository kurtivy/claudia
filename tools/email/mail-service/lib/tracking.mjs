// Claudia Mail — Tracking Library
// Open pixel, click tracking, link rewriting for Bluehost campaigns

import config from '../config.mjs';

// 1x1 transparent PNG pixel (68 bytes)
const PIXEL_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export function getPixelBuffer() {
  return PIXEL_BUFFER;
}

// Rewrite links in HTML for click tracking
// Converts: <a href="https://example.com">
// To:       <a href="PUBLIC_URL/api/c/TRACKING_ID/BASE64_URL">
export function rewriteLinks(html, trackingId) {
  if (!config.publicUrl || !html) return html;

  return html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url) => {
      // Don't rewrite unsubscribe links or tracking URLs
      if (url.includes('/api/unsubscribe') || url.includes('/api/t/') || url.includes('/api/c/')) {
        return match;
      }
      const encoded = Buffer.from(url).toString('base64url');
      return `href="${config.publicUrl}/api/c/${trackingId}/${encoded}"`;
    }
  );
}

// Inject tracking pixel into HTML
export function injectPixel(html, trackingId) {
  if (!config.publicUrl || !html) return html;

  const pixelUrl = `${config.publicUrl}/api/t/${trackingId}.png`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;

  // Try to inject before </body>, fallback to appending
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  return html + pixel;
}

export default { getPixelBuffer, rewriteLinks, injectPixel };
