/**
 * api/subscribe.js — Beehiiv Newsletter Subscription
 *
 * Receives email from client, validates it, and calls Beehiiv API server-side.
 * API credentials are never exposed to the browser.
 *
 * Environment variables required:
 *   BEEHIIV_API_KEY         - Your Beehiiv API key (starts with "pak_")
 *   BEEHIIV_PUBLICATION_ID  - Your publication ID (UUID format)
 *
 * POST /api/subscribe
 * Body: { email: "user@example.com" }
 *
 * Success (200):
 *   { success: true, message: "Subscribed successfully" }
 *
 * Error (400/500):
 *   { error: "error message" }
 */

module.exports = async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  // Validate email
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Get API credentials from environment
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;

  if (!apiKey || !pubId) {
    console.error('Missing Beehiiv configuration');
    return res.status(500).json({
      error: 'Server configuration error. Please contact support.'
    });
  }

  try {
    // Call Beehiiv API server-side
    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          email: email.trim(),
          reactivation_email: true // Re-subscribe if previously unsubscribed
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      // Beehiiv returned an error
      const errorMsg = data?.error?.message || data?.message || 'Subscription failed';
      console.error('Beehiiv API error:', errorMsg, data);

      // Return 400 if it's a validation error, 500 for server errors
      const statusCode = response.status === 400 ? 400 : 500;
      return res.status(statusCode).json({ error: errorMsg });
    }

    // Success
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      message: 'Subscribed successfully',
      email: email.trim()
    });
  } catch (error) {
    console.error('Subscribe error:', error.message);
    return res.status(500).json({
      error: 'Subscription failed. Please try again later.'
    });
  }
};
