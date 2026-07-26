const { fetchFeeds } = require('./rssCore');

// GET /api/movies -- real backend call to public film-news RSS feeds (Variety),
// merged and returned as JSON for the "Movies updates" section on the start page.
// Note: this surfaces movie *news* headlines (releases, reviews, box office),
// not a live "now showing" theater listing -- there's no free, keyless API for
// that, so news coverage is the honest equivalent here.
module.exports = async (req, res) => {
  try {
    const items = await fetchFeeds([
      { url: 'https://variety.com/v/film/feed/', name: 'Variety Film' }
    ], 12);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ items: items.slice(0, 12) });
  } catch (err) {
    res.status(502).json({ error: 'Could not load movie updates right now', items: [] });
  }
};
