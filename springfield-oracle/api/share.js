// api/share.js — Per-prediction share page
// Social crawlers (Twitter, LinkedIn, Facebook) see prediction-specific OG tags.
// Human visitors are redirected to the main site with the modal auto-opened.

const fs   = require('fs');
const path = require('path');

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
  const { id } = req.query;

  let p = null;
  try {
    const jsonPath = path.join(process.cwd(), 'public', 'data', 'predictions.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    p = data.predictions.find(x => x.id === id) || null;
  } catch (_) {}

  const BASE = 'https://springfield-oracle.vercel.app';

  const title       = p ? p.title : 'Springfield Oracle — The Simpsons Prediction Tracker';
  const season      = p ? `S${String(p.season).padStart(2,'0')}E${String(p.episode).padStart(2,'0')}` : '';
  const epName      = p ? (p.episode_name || '') : '';
  const year        = p ? p.year_aired : '';
  const status      = p ? p.status : '';
  const prediction  = p ? (p.prediction || '') : '';
  const realEvent   = p ? (p.real_event || '') : '';
  const realYear    = p ? (p.real_year  || '') : '';

  const statusLabel = status === 'confirmed' ? '✅ CONFIRMED' : status === 'debunked' ? '⚠️ DEBUNKED' : '👀 UNFOLDING NOW';
  const episodeLine = [season, epName, year ? `(${year})` : ''].filter(Boolean).join(' · ');

  const ogTitle = p
    ? `${statusLabel}: ${title} — Springfield Oracle`
    : 'Springfield Oracle — The Simpsons Prediction Tracker';

  const ogDesc = p
    ? [
        episodeLine,
        prediction ? prediction.slice(0, 120) + (prediction.length > 120 ? '…' : '') : '',
        realEvent  ? `Real world: ${realEvent.slice(0, 80)}${realEvent.length > 80 ? '…' : ''}` : '',
        realYear   ? `Matched in ${realYear}.` : ''
      ].filter(Boolean).join(' | ')
    : 'Every Simpsons prediction that came true — sourced, fact-checked, and tracked in real time.';

  const ogImage  = id ? `${BASE}/api/og-image?id=${encodeURIComponent(id)}` : `${BASE}/og-image.png`;
  const ogUrl    = id ? `${BASE}/share?id=${encodeURIComponent(id)}`        : BASE;
  const redirect = id ? `${BASE}/#${encodeURIComponent(id)}`                : BASE;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(ogTitle)}</title>

  <!-- Open Graph -->
  <meta property="og:type"        content="article">
  <meta property="og:url"         content="${esc(ogUrl)}">
  <meta property="og:title"       content="${esc(ogTitle)}">
  <meta property="og:description" content="${esc(ogDesc)}">
  <meta property="og:image"       content="${esc(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name"   content="Springfield Oracle">

  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(ogTitle)}">
  <meta name="twitter:description" content="${esc(ogDesc)}">
  <meta name="twitter:image"       content="${esc(ogImage)}">
  <meta name="twitter:site"        content="@SpringfieldOracle">

  <meta http-equiv="refresh" content="0;url=${esc(redirect)}">
  <style>
    body { margin: 0; background: #FFD520; font-family: monospace; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { text-align: center; color: #0B2D8F; }
    a { color: #0B2D8F; font-weight: bold; }
  </style>
</head>
<body>
  <div class="box">
    <p>Redirecting to Springfield Oracle…</p>
    <p><a href="${esc(redirect)}">Click here if not redirected</a></p>
  </div>
  <script>window.location.replace(${JSON.stringify(redirect)});</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  res.status(200).send(html);
};
