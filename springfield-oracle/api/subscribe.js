module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const PUBLICATION_ID = '62cfda32-7031-4c9d-9972-fb9b355cd4ec';
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

    if (beehiivRes.ok) {
      return res.status(200).json({ ok: true });
    }

    const body = await beehiivRes.text();
    console.error('Beehiiv error', beehiivRes.status, body);
    return res.status(502).json({ error: 'Subscription failed' });
  } catch (err) {
    console.error('Subscribe error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
