const { fetchFeeds } = require('./rssCore');

// GET /api/news -- real backend call to public news RSS feeds (BBC + Reuters),
// merged and returned as JSON for the "News updates" section on the start page.
module.exports = async (req, res) => {
  try {
    const items = await fetchFeeds([
      { url: 'http://feeds.bbci.co.uk/news/rss.xml', name: 'BBC News' },
      { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' }
    ], 10);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ items: items.slice(0, 12) });
  } catch (err) {
    res.status(502).json({ error: 'Could not load news right now', items: [] });
  }
};
