// api/news.js — Vercel serverless function
// Fetches and parses RSS feeds related to Simpsons predictions
// Runs server-side to avoid CORS issues

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // 5-minute cache

  const RSS_FEEDS = [
    'https://rss.app/feeds/tV7KMhLYMJnGiVdD.xml', // "simpsons prediction" Google News RSS
    'https://news.google.com/rss/search?q=simpsons+predicted&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=simpsons+prediction+2026&hl=en-US&gl=US&ceid=US:en',
  ];

  try {
    const results = await Promise.allSettled(
      RSS_FEEDS.map(url =>
        fetch(url, {
          headers: { 'User-Agent': 'Springfield-Oracle/1.0' }
        }).then(r => r.text())
      )
    );

    const items = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const xml = result.value;

      // Parse items from RSS XML
      const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

      for (const item of itemMatches.slice(0, 10)) {
        const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                       item.match(/<title>(.*?)<\/title>/))?.[1] || '';
        const link  = (item.match(/<link>(.*?)<\/link>/) ||
                       item.match(/<guid>(.*?)<\/guid>/))?.[1] || '';
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        const description = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                              item.match(/<description>(.*?)<\/description>/))?.[1] || '';

        if (title && link) {
          items.push({
            title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
            link,
            pubDate,
            description: description.replace(/<[^>]+>/g, '').slice(0, 200)
          });
        }
      }
    }

    // Deduplicate by title
    const seen = new Set();
    const unique = items.filter(item => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    });

    res.status(200).json({ items: unique.slice(0, 15), cached_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message, items: [] });
  }
}
