const { fetchFeeds } = require('./rssCore');

// GET /api/sports -- real backend call to public sports RSS feeds (BBC Sport),
// merged and returned as JSON for the "Sports updates" section on the start page.
module.exports = async (req, res) => {
  try {
    const items = await fetchFeeds([
      { url: 'http://feeds.bbci.co.uk/sport/rss.xml', name: 'BBC Sport' },
      { url: 'http://feeds.bbci.co.uk/sport/football/rss.xml', name: 'BBC Football' }
    ], 10);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ items: items.slice(0, 12) });
  } catch (err) {
    res.status(502).json({ error: 'Could not load sports updates right now', items: [] });
  }
};
