'use strict';

const express = require('express');
const path = require('path');
const { fetchAndCompress } = require('./proxyCore');
const { fetchFeeds } = require('./rssCore');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the static app shell (index.html, games.html, icons, manifest, sw.js).
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

app.get('/api/suggest', async (req, res) => {
  const q = req.query.q;
  if (!q || !q.trim()) return res.json([]);
  try {
    const upstream = await fetch('https://duckduckgo.com/ac/?type=list&q=' + encodeURIComponent(q));
    const data = await upstream.json();
    const suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    res.json(suggestions.slice(0, 8));
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/news', async (req, res) => {
  try {
    const items = await fetchFeeds([
      { url: 'http://feeds.bbci.co.uk/news/rss.xml', name: 'BBC News' },
      { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' }
    ], 10);
    res.json({ items: items.slice(0, 12) });
  } catch (err) {
    res.status(502).json({ error: 'Could not load news right now', items: [] });
  }
});

app.get('/api/sports', async (req, res) => {
  try {
    const items = await fetchFeeds([
      { url: 'http://feeds.bbci.co.uk/sport/rss.xml', name: 'BBC Sport' },
      { url: 'http://feeds.bbci.co.uk/sport/football/rss.xml', name: 'BBC Football' }
    ], 10);
    res.json({ items: items.slice(0, 12) });
  } catch (err) {
    res.status(502).json({ error: 'Could not load sports updates right now', items: [] });
  }
});

app.get('/api/movies', async (req, res) => {
  try {
    const items = await fetchFeeds([
      { url: 'https://variety.com/v/film/feed/', name: 'Variety Film' }
    ], 12);
    res.json({ items: items.slice(0, 12) });
  } catch (err) {
    res.status(502).json({ error: 'Could not load movie updates right now', items: [] });
  }
});

app.get('/api/proxy', async (req, res) => {
  const rawUrl = req.query.url;
  const rawMode = req.query.mode;
  const mode = (rawMode === 'read' || rawMode === 'turbo') ? rawMode : 'normal';

  if (!rawUrl) return res.status(400).json({ error: 'Missing "url" query parameter' });

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).toString();
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const result = await fetchAndCompress(targetUrl, mode);
    res.set('x-briskmini-final-url', result.finalUrl);
    res.set('x-briskmini-original-bytes', String(result.originalBytes));
    res.set('x-briskmini-served-bytes', String(result.servedBytes));
    res.set('x-briskmini-savings', `${result.savingsPct}%`);
    res.set('Cache-Control', 'no-store');

    if (result.passthroughBinary) {
      res.type(result.contentType || 'application/octet-stream');
      return res.send(Buffer.from(result.html, 'binary'));
    }

    res.type('html');
    res.send(result.html);
  } catch (err) {
    res.status(502).json({ error: 'Could not load that page', detail: String((err && err.message) || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Brisk Mini server running at http://localhost:${PORT}`);
});
