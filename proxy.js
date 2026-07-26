const { fetchAndCompress } = require('./proxyCore');

/**
 * GET /api/proxy?url=<encoded target>&mode=normal|read
 *
 * This is the real backend behind Brisk Mini's data-saving badge. The
 * browser shell (index.html) calls this endpoint instead of loading pages
 * directly, so:
 *   - the phone only ever downloads the compressed version served here
 *   - the response headers below carry the true original/served byte
 *     counts, which the UI uses to show genuine savings (not a fake number)
 */
module.exports = async (req, res) => {
  const rawUrl = req.query && req.query.url;
  const rawMode = req.query && req.query.mode;
  const mode = (rawMode === 'read' || rawMode === 'turbo') ? rawMode : 'normal';

  if (!rawUrl) {
    res.status(400).json({ error: 'Missing "url" query parameter' });
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).toString();
  } catch (e) {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  try {
    const result = await fetchAndCompress(targetUrl, mode);

    res.setHeader('x-briskmini-final-url', result.finalUrl);
    res.setHeader('x-briskmini-original-bytes', String(result.originalBytes));
    res.setHeader('x-briskmini-served-bytes', String(result.servedBytes));
    res.setHeader('x-briskmini-savings', `${result.savingsPct}%`);
    res.setHeader('Cache-Control', 'no-store');

    if (result.passthroughBinary) {
      res.setHeader('Content-Type', result.contentType || 'application/octet-stream');
      res.status(200).send(Buffer.from(result.html, 'binary'));
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(result.html);
  } catch (err) {
    res.status(502).json({ error: 'Could not load that page', detail: String(err && err.message || err) });
  }
};
