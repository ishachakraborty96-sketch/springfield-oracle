module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const PUBLICATION_ID = process.env.BEEHIIV_API_KEY_V2;
  const API_KEY = process.env.BEEHIIV_API_KEY;
  // Temporary debug — remove after confirming
  return res.status(200).json({
    pubId: PUBLICATION_ID ? PUBLICATION_ID.slice(0, 10) + '...' : 'MISSING',
    apiKey: API_KEY ? API_KEY.slice(0, 6) + '...' : 'MISSING'
  });

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

    // Temporarily expose Beehiiv's error for debugging
    return res.status(502).json({ beehiivStatus: beehiivRes.status, beehiivBody: body });
  } catch (err) {
    console.error('Subscribe error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
