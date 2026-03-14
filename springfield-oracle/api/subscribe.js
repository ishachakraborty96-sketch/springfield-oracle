module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    // Use Beehiiv's public subscribe endpoint (same as their embed form, no API key required)
    const formData = new URLSearchParams({
      email: email.trim(),
      publication_id: '62cfda32-7031-4c9d-9972-fb9b355cd4ec',
      double_opt_in: 'false'
    });

    await fetch('https://app.beehiiv.com/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      redirect: 'manual'
    });

    // Always return success — Beehiiv handles duplicates gracefully
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
};
