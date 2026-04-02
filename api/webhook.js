const crypto = require('crypto');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function sendEmail({ to, subject, html }) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'TARAhut AI Labs <noreply@tarahutailabs.com>',
      to,
      subject,
      html
    })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);

  // Verify Razorpay webhook signature
  const signature = req.headers['x-razorpay-signature'];
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const payload = JSON.parse(rawBody);

  if (payload.event !== 'payment.captured') {
    return res.status(200).json({ message: 'Event ignored' });
  }

  const payment = payload.payment.entity;
  const studentName = payment.name || 'Student';
  const studentEmail = payment.email;
  const studentPhone = payment.contact;
  const amountPaid = (payment.amount / 100).toLocaleString('en-IN');
  const paymentId = payment.id;

  // Decrement seats in Supabase
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

  // Email to student
  if (studentEmail) {
    await sendEmail({
      to: studentEmail,
      subject: '🎉 Your Seat is Confirmed — TARAhut AI Labs',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#07070f;color:#f0f0f8;padding:40px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:30px;">
            <h1 style="color:#00e5ff;font-size:28px;margin:0;">TARAhut AI Labs</h1>
            <p style="color:#8888aa;margin:5px 0;">Punjab's First AI Training Lab · Kotkapura</p>
          </div>
          <div style="background:#0f1024;border:1px solid rgba(0,229,255,0.2);border-radius:12px;padding:30px;margin-bottom:24px;">
            <h2 style="color:#b8ff3a;margin-top:0;">✅ Seat Confirmed!</h2>
            <p style="color:#f0f0f8;font-size:16px;">Hi ${studentName},</p>
            <p style="color:#f0f0f8;">Your payment of <strong style="color:#00e5ff;">₹${amountPaid}</strong> has been received and your seat in the <strong>Founders Batch</strong> is confirmed!</p>
            <div style="background:#07070f;border-radius:8px;padding:16px;margin:20px 0;">
              <p style="margin:4px 0;color:#8888aa;font-size:14px;">Payment ID: <span style="color:#f0f0f8;">${paymentId}</span></p>
              <p style="margin:4px 0;color:#8888aa;font-size:14px;">Amount Paid: <span style="color:#f0f0f8;">₹${amountPaid}</span></p>
            </div>
            <p style="color:#f0f0f8;">Mr. Parveen will WhatsApp you shortly with batch schedule and next steps.</p>
          </div>
          <div style="background:#0f1024;border:1px solid rgba(184,255,58,0.2);border-radius:12px;padding:24px;">
            <h3 style="color:#b8ff3a;margin-top:0;">📋 What's Next?</h3>
            <p style="color:#f0f0f8;margin:8px 0;">1️⃣ Watch for a WhatsApp message from Mr. P</p>
            <p style="color:#f0f0f8;margin:8px 0;">2️⃣ You'll be added to the student group</p>
            <p style="color:#f0f0f8;margin:8px 0;">3️⃣ Show up on Day 1 and start your AI journey!</p>
          </div>
          <p style="text-align:center;color:#55557a;font-size:12px;margin-top:30px;">
            TARAhut AI Labs · Kotkapura, Punjab · +91 98150-63184
          </p>
        </div>
      `
    });
  }

  // Email to admin
  await sendEmail({
    to: 'psukhija@tarahut.com',
    subject: `🚀 New Enrollment — ${studentName} paid ₹${amountPaid}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#07070f;color:#f0f0f8;padding:40px;border-radius:12px;">
        <h2 style="color:#00e5ff;">New Enrollment Received!</h2>
        <div style="background:#0f1024;border:1px solid rgba(0,229,255,0.2);border-radius:12px;padding:24px;margin:20px 0;">
          <p style="margin:8px 0;color:#8888aa;">Name: <strong style="color:#f0f0f8;">${studentName}</strong></p>
          <p style="margin:8px 0;color:#8888aa;">Email: <strong style="color:#f0f0f8;">${studentEmail || 'Not provided'}</strong></p>
          <p style="margin:8px 0;color:#8888aa;">Phone: <strong style="color:#f0f0f8;">${studentPhone || 'Not provided'}</strong></p>
          <p style="margin:8px 0;color:#8888aa;">Amount Paid: <strong style="color:#b8ff3a;">₹${amountPaid}</strong></p>
          <p style="margin:8px 0;color:#8888aa;">Payment ID: <strong style="color:#f0f0f8;">${paymentId}</strong></p>
          <p style="margin:8px 0;color:#8888aa;">Seats Remaining: <strong style="color:#ff2d87;">${current - 1}</strong></p>
        </div>
        <p style="color:#f0f0f8;">Send them a WhatsApp to confirm batch details!</p>
        ${studentPhone ? `<a href="https://wa.me/${studentPhone.replace('+','')}?text=Hi! Your seat at TARAhut AI Labs is confirmed. Welcome to the Founders Batch!" style="display:inline-block;background:linear-gradient(135deg,#00e5ff,#6366f1);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">WhatsApp ${studentName}</a>` : ''}
      </div>
    `
  });

  res.status(200).json({ success: true, seats_remaining: current - 1 });
};
