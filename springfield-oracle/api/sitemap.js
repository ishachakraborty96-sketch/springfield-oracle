// api/sitemap.js — Vercel serverless function
// Serves sitemap.xml with the correct application/xml Content-Type header.
// Using a serverless function ensures Vercel doesn't fall back to an HTML
// response when the static route fails to resolve.

export default function handler(req, res) {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

  <url>
    <loc>https://www.springfieldoracle.com/</loc>
    <lastmod>2026-03-03</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <url>
    <loc>https://www.springfieldoracle.com/about</loc>
    <lastmod>2026-03-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>https://www.springfieldoracle.com/faq</loc>
    <lastmod>2026-03-03</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>

</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  res.status(200).send(sitemap);
}
