'use strict';

/**
 * Brisk Mini proxy core.
 *
 * This is the real backend behind the "save up to 85% data" claim in the UI.
 * Given a URL, it:
 *   1. Fetches the page server-side (so the phone never downloads the
 *      original, uncompressed page).
 *   2. Strips things that cost bytes but rarely matter on a small screen:
 *      HTML comments, tracking/analytics scripts, oversized inline SVG/
 *      base64 data, and (in "read" mode) navigation chrome, ads-shaped
 *      containers, and non-content scripts entirely.
 *   3. Collapses redundant whitespace.
 *   4. Rewrites relative links/assets against a <base> tag so the page
 *      still works when rendered via srcdoc in the browser shell's iframe.
 *
 * It returns the transformed HTML plus the real original/served byte counts
 * so the UI's "data saved" badge reflects genuine measurements, not a fake
 * static number.
 */

const TRACKER_HOST_FRAGMENTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'facebook.net',
  'connect.facebook.net',
  'hotjar.com',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'amplitude.com',
  'fullstory.com',
  'clarity.ms',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
  'scorecardresearch.com',
  'quantserve.com'
];

const ADLIKE_CLASS_ID_FRAGMENTS = [
  'advert', 'sponsor', 'promo-banner', 'cookie-consent', 'cookie-banner',
  'newsletter-signup', 'subscribe-modal', 'paywall', 'popup-overlay'
];

function stripHtmlComments(html) {
  // Keep IE conditional comments intact (rare on modern sites, harmless to keep).
  return html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
}

function stripTrackerScripts(html) {
  return html.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
    const isTracker = TRACKER_HOST_FRAGMENTS.some((host) => src.includes(host));
    return isTracker ? '' : match;
  });
}

function stripAdLikeBlocks(html) {
  // Best-effort removal of common ad/consent containers by class or id name.
  const pattern = new RegExp(
    `<div[^>]*(?:class|id)=["'][^"']*(?:${ADLIKE_CLASS_ID_FRAGMENTS.join('|')})[^"']*["'][^>]*>[\\s\\S]*?<\\/div>`,
    'gi'
  );
  return html.replace(pattern, '');
}

function collapseWhitespace(html) {
  return html
    .replace(/[\t\n\r]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

function stripForReaderMode(html) {
  let out = html;
  // Drop all scripts entirely in reader mode -- nothing here needs to be interactive.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  // Drop nav/header/footer/aside chrome.
  out = out.replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Drop iframes (ads, embeds) -- keep it text-focused and light.
  out = out.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  return out;
}

function stripForTurboMode(html) {
  // Turbo mode: keep the page interactive (scripts/layout intact) but cut
  // the single biggest source of mobile data usage -- images and other
  // heavy media -- since those routinely dwarf the HTML/CSS/JS on a page.
  let out = html;
  out = out.replace(/<img\b[^>]*>/gi, '');
  out = out.replace(/<picture\b[\s\S]*?<\/picture>/gi, '');
  out = out.replace(/<source\b[^>]*>/gi, '');
  out = out.replace(/<video\b[\s\S]*?<\/video>/gi, '');
  out = out.replace(/<audio\b[\s\S]*?<\/audio>/gi, '');
  // Strip large inline base64 data URIs wherever they appear (backgrounds, etc).
  out = out.replace(/url\(["']?data:image\/[^)]{300,}["']?\)/gi, 'none');
  return out;
}

function injectBaseTag(html, baseUrl) {
  if (/<base\s/i.test(html)) return html;
  const baseTag = `<base href="${baseUrl}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`);
  }
  return `<head>${baseTag}</head>${html}`;
}

function byteLength(str) {
  return Buffer.byteLength(str, 'utf8');
}

/**
 * Fetch + transform a page.
 * @param {string} targetUrl
 * @param {'normal'|'read'|'turbo'} mode
 * @returns {Promise<{html: string, finalUrl: string, originalBytes: number, servedBytes: number, savingsPct: number}>}
 */
async function fetchAndCompress(targetUrl, mode) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/124.0.0.0 Mobile Safari/537.36 BriskMini/3.0 (+https://briskmini.vercel.app)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
  } finally {
    clearTimeout(timeout);
  }

  const finalUrl = response.url || targetUrl;
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    // Not an HTML document (image, PDF, JSON, etc.) -- pass through untouched,
    // there is nothing safe to compress without breaking the file.
    const buf = Buffer.from(await response.arrayBuffer());
    return {
      html: buf.toString('binary'),
      finalUrl,
      originalBytes: buf.length,
      servedBytes: buf.length,
      savingsPct: 0,
      passthroughBinary: true,
      contentType
    };
  }

  const original = await response.text();
  const originalBytes = byteLength(original);

  let transformed = original;
  transformed = stripHtmlComments(transformed);
  transformed = stripTrackerScripts(transformed);
  transformed = stripAdLikeBlocks(transformed);
  if (mode === 'read') transformed = stripForReaderMode(transformed);
  if (mode === 'turbo') transformed = stripForTurboMode(transformed);
  transformed = injectBaseTag(transformed, finalUrl);
  transformed = collapseWhitespace(transformed);

  const servedBytes = byteLength(transformed);
  const savingsPct = originalBytes > 0
    ? Math.max(0, Math.round((1 - servedBytes / originalBytes) * 100))
    : 0;

  return { html: transformed, finalUrl, originalBytes, servedBytes, savingsPct };
}

module.exports = { fetchAndCompress };
