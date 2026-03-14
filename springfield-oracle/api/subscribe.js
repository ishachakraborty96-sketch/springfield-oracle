module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const beehiivRes = await fetch('https://app.beehiiv.com/api/v1/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        publication_id: '62cfda32-7031-4c9d-9972-fb9b355cd4ec',
        double_opt_in: false
      })
    });

    // 200/201 = subscribed, 409 = already subscribed — both are fine
    if (beehiivRes.ok || beehiivRes.status === 409) {
      return res.status(200).json({ ok: true });
    }

    return res.status(502).json({ error: 'Subscription failed' });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
};
