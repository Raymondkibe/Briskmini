'use strict';

/**
 * Minimal, dependency-free RSS 2.0 parser.
 *
 * Real news/sports/movies outlets publish standard RSS feeds. Rather than
 * pulling in a heavy XML library, this extracts the handful of fields the
 * Brisk Mini start page actually needs (title, link, published date,
 * description) with a small set of regexes. It's forgiving of CDATA
 * wrapping and namespaced tags, which covers the vast majority of
 * real-world feeds (BBC, Variety, etc.).
 */

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function parseRss(xml, sourceName, limit = 12) {
  const items = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks.slice(0, limit)) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') || extractTag(block, 'guid');
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date');
    let description = extractTag(block, 'description');
    // Strip any embedded HTML tags from description snippets.
    description = description.replace(/<[^>]+>/g, '').slice(0, 180);
    if (title && link) {
      items.push({ title, link, pubDate, description, source: sourceName });
    }
  }
  return items;
}

async function fetchFeed(url, sourceName, limit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BriskMini/3.0 (+https://briskmini.vercel.app)' }
    });
    if (!res.ok) throw new Error(`Feed ${sourceName} returned ${res.status}`);
    const xml = await res.text();
    return parseRss(xml, sourceName, limit);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch multiple feeds in parallel and merge, newest first when dates parse.
 */
async function fetchFeeds(feeds, limitPerFeed = 8) {
  const results = await Promise.allSettled(
    feeds.map((f) => fetchFeed(f.url, f.name, limitPerFeed))
  );
  let merged = [];
  for (const r of results) {
    if (r.status === 'fulfilled') merged = merged.concat(r.value);
  }
  merged.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return merged;
}

module.exports = { fetchFeeds, fetchFeed, parseRss };
