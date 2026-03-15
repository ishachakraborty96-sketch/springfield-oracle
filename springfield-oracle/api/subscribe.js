// Simple in-memory rate limiter: max 5 requests per IP per hour
// Note: per-instance only on serverless — provides meaningful deterrence, not absolute enforcement
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

// RFC 5322-inspired regex — rejects the worst malformed inputs without false positives
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,63}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const PUBLICATION_ID = process.env.BEEHIIV_API_KEY_V2;
  const API_KEY = process.env.BEEHIIV_API_KEY;

  try {
    const beehiivRes = await fetch(
      `https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          email: email.trim(),
          reactivate_existing: true,
          send_welcome_email: true
        })
      }
    );

    const body = await beehiivRes.text();
    if (beehiivRes.ok) {
      return res.status(200).json({ ok: true });
    }

    // Log full detail server-side only; return generic message to client
    console.error('Beehiiv error', beehiivRes.status, body);
    return res.status(502).json({ error: 'Email service temporarily unavailable. Please try again.' });
  } catch (err) {
    console.error('Subscribe error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
