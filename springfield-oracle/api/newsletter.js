export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    // Call BeehivIV API with authentication
    const beehiivResponse = await fetch('https://api.beehiiv.com/v1/publications/62cfda32-7031-4c9d-9972-fb9b355cd4ec/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        reactivation_method: 'unsubscribed_only',
        send_welcome_email: true,
      }),
    });

    // Check if the response is OK
    if (!beehiivResponse.ok) {
      const errorData = await beehiivResponse.text();
      console.error('BeehivIV API error:', beehiivResponse.status, errorData);
      return res.status(beehiivResponse.status).json({
        error: 'Failed to subscribe. Please try again.',
        details: errorData
      });
    }

    const data = await beehiivResponse.json();
    return res.status(200).json({
      success: true,
      message: 'Successfully subscribed to newsletter',
      data: data
    });
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    return res.status(500).json({
      error: 'An error occurred. Please try again later.',
      details: error.message
    });
  }
}
