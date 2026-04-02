const crypto = require('crypto');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);

  // Verify Razorpay webhook signature
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const payload = JSON.parse(rawBody);

  // Only process successful payments
  if (payload.event !== 'payment.captured') {
    return res.status(200).json({ message: 'Event ignored' });
  }

  // Get current seat count from Supabase
  const getRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/ailabs_config?id=eq.1&select=seats_left`,
    {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    }
  );

  const data = await getRes.json();
  const current = data[0]?.seats_left ?? 0;

  if (current > 0) {
    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/ailabs_config?id=eq.1`,
      {
        method: 'PATCH',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ seats_left: current - 1 })
      }
    );
  }

  res.status(200).json({ success: true, seats_remaining: current - 1 });
};
