// GET /api/suggest?q=<query>
//
// Every search input in Brisk Mini (address bar + start-page search) calls
// this instead of hitting a third-party autocomplete API directly from the
// browser. Routing it through our own backend means it works consistently
// across all mobile browser contexts (some block cross-origin fetches from
// installed PWAs) and gives us one place to swap/added providers later.
module.exports = async (req, res) => {
  const q = req.query && req.query.q;
  if (!q || !q.trim()) {
    res.status(200).json([]);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const upstream = await fetch(
      'https://duckduckgo.com/ac/?type=list&q=' + encodeURIComponent(q),
      { signal: controller.signal, headers: { 'User-Agent': 'BriskMini/3.0' } }
    );
    if (!upstream.ok) throw new Error('Suggestion provider returned ' + upstream.status);
    const data = await upstream.json();
    // DuckDuckGo's "list" format is [query, [suggestion, ...]]
    const suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(suggestions.slice(0, 8));
  } catch (err) {
    res.status(200).json([]); // fail quietly -- suggestions are non-critical
  } finally {
    clearTimeout(timeout);
  }
};
