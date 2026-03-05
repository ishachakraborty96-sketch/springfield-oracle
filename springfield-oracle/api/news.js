// api/news.js — Vercel serverless function
// Proxies Google News RSS server-side to avoid browser CORS restrictions
// Used as primary news source by the frontend live-match feature

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  const rssUrl = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';

  try {
    const response = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpringfieldOracle/1.0)' }
    });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const xml = await response.text();

    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const items = [];

    for (const item of itemMatches.slice(0, 20)) {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                     item.match(/<title>(.*?)<\/title>/))?.[1] || '';
      const link  = (item.match(/<link>(.*?)<\/link>/) ||
                     item.match(/<guid>(.*?)<\/guid>/))?.[1] || '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

      if (title && link) {
        items.push({
          title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ''),
          link,
          pubDate
        });
      }
    }

    res.status(200).json({ items, cached_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', items: [] });
  }
}
