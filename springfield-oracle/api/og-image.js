// api/og-image.js — Dynamic OG image generator (SVG)
// Returns a 1200x630 SVG image branded per prediction

const fs   = require('fs');
const path = require('path');

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapLines(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + (line ? ' ' : '') + word).length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function svgTextLines(lines, x, startY, lineHeight, fontSize, fill, weight) {
  return lines.map((l, i) =>
    `<text x="${x}" y="${startY + i * lineHeight}" font-family="Arial Black,Impact,sans-serif" font-size="${fontSize}" font-weight="${weight || 900}" fill="${esc(fill)}">${esc(l)}</text>`
  ).join('\n  ');
}

module.exports = async function handler(req, res) {
  const { id } = req.query;

  let p = null;
  try {
    const jsonPath = path.join(__dirname, '../public/data/predictions.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    p = data.predictions.find(x => x.id === id) || null;
  } catch (e) {
    // File not found or parse error - will use defaults
  }

  const title    = p ? p.title    : 'The Simpsons Predicted It.';
  const season   = p ? `S${String(p.season).padStart(2,'0')}E${String(p.episode).padStart(2,'0')}` : '';
  const epName   = p ? (p.episode_name || '') : '';
  const year     = p ? p.year_aired : '';
  const status   = p ? p.status : 'confirmed';
  const category = p ? (p.category || '') : '';
  const realYear = p ? (p.real_year || '') : '';

  const statusLabel = status === 'confirmed' ? 'CONFIRMED' : status === 'debunked' ? 'DEBUNKED' : 'UNFOLDING';
  const statusBg    = status === 'confirmed' ? '#22c55e' : status === 'debunked' ? '#FF6B2B' : '#FFD520';
  const statusFg    = status === 'unfolding' || status === 'pending' ? '#0B0B0F' : '#fff';

  const episodeLine = [season, epName ? `· ${epName}` : '', year ? `(${year})` : ''].filter(Boolean).join(' ');
  const metaLine    = [category, realYear ? `Matched: ${realYear}` : ''].filter(Boolean).join('  ·  ');

  // Title wraps at ~28 chars per line for 42px font on 560px panel
  const titleLines  = wrapLines(title, 28).slice(0, 4);
  const titleStartY = 280;
  const titleSvg    = svgTextLines(titleLines, 60, titleStartY, 56, 42, '#0B0B0F', 900);

  // Episode line
  const epLineTrunc = episodeLine.length > 55 ? episodeLine.slice(0, 52) + '…' : episodeLine;

  const statusBadgeWidth = statusLabel.length * 14 + 32;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="yellowGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFD520"/>
      <stop offset="100%" stop-color="#ECC000"/>
    </linearGradient>
    <clipPath id="leftClip">
      <polygon points="0,0 760,0 700,630 0,630"/>
    </clipPath>
  </defs>

  <!-- Dark background base -->
  <rect width="1200" height="630" fill="#0B0B0F"/>

  <!-- Yellow left panel -->
  <polygon points="0,0 760,0 700,630 0,630" fill="url(#yellowGrad)"/>

  <!-- Diagonal accent line -->
  <line x1="762" y1="0" x2="702" y2="630" stroke="#FFD520" stroke-width="3" opacity="0.6"/>

  <!-- Top bar -->
  <rect x="0" y="0" width="700" height="6" fill="#0B2D8F"/>

  <!-- Branding -->
  <text x="60" y="65" font-family="Arial Black,Impact,sans-serif" font-size="13" font-weight="900" fill="#0B2D8F" letter-spacing="5">SPRINGFIELD ORACLE</text>
  <line x1="60" y1="78" x2="640" y2="78" stroke="#0B2D8F" stroke-width="1.5" opacity="0.35"/>

  <!-- Status badge -->
  <rect x="60" y="100" width="${statusBadgeWidth}" height="34" rx="4" fill="${statusBg}"/>
  <text x="${60 + statusBadgeWidth / 2}" y="122" font-family="Arial Black,sans-serif" font-size="13" font-weight="900" fill="${statusFg}" text-anchor="middle" letter-spacing="2">${statusLabel}</text>

  <!-- Episode / metadata -->
  <text x="60" y="195" font-family="Courier New,monospace" font-size="17" fill="#0B2D8F" opacity="0.75">${esc(epLineTrunc)}</text>
  <text x="60" y="225" font-family="Courier New,monospace" font-size="14" fill="#0B2D8F" opacity="0.5">${esc(metaLine)}</text>

  <!-- Title lines -->
  ${titleSvg}

  <!-- Divider before URL -->
  <line x1="60" y1="570" x2="640" y2="570" stroke="#0B2D8F" stroke-width="1" opacity="0.25"/>
  <text x="60" y="598" font-family="Courier New,monospace" font-size="14" fill="#0B2D8F" opacity="0.55" letter-spacing="1">springfieldoracle.com</text>

  <!-- Right panel: decorative "CALLED IT." -->
  <text x="800" y="260" font-family="Arial Black,Impact,sans-serif" font-size="110" font-weight="900" fill="#FFD520" opacity="0.08" transform="rotate(-8,800,260)">CALLED</text>
  <text x="820" y="390" font-family="Arial Black,Impact,sans-serif" font-size="110" font-weight="900" fill="#FFD520" opacity="0.08" transform="rotate(-8,820,390)">IT.</text>

  <!-- Right panel circles -->
  <circle cx="1050" cy="315" r="180" fill="none" stroke="#FFD520" stroke-width="1" opacity="0.12"/>
  <circle cx="1050" cy="315" r="120" fill="none" stroke="#FFD520" stroke-width="1" opacity="0.08"/>
  <circle cx="1050" cy="315" r="60"  fill="none" stroke="#FFD520" stroke-width="1" opacity="0.06"/>

  <!-- Right panel prediction ID -->
  <text x="840" y="580" font-family="Courier New,monospace" font-size="13" fill="#FFD520" opacity="0.3">${esc(id || '')}</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  res.status(200).send(svg);
};
