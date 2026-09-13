import crypto from 'crypto';

const SENDER = { name: 'GLP-1 Ownership', email: 'support@glp1ownership.com' };
const SIGNATURE_TOLERANCE_SECONDS = 300;

function signatureIsValid(rawBody, header, secret) {
  if (!header || !secret) return false;

  const parts = {};
  for (const piece of header.split(',')) {
    const [key, value] = piece.split('=');
    if (key && value) parts[key.trim()] = value.trim();
  }

  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function confirmationHtml(firstName) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  return `
<div style="background:#F7F2E4;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#20301F;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid rgba(32,48,31,0.14);border-radius:14px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;color:#B5502E;font-weight:700;">ORDER CONFIRMED</p>
    <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:26px;line-height:1.2;color:#20301F;">Welcome to the GLP-1 Ownership Protocol</h1>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Your payment went through and your order is confirmed. Here's everything included:</p>

    <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.9;">
      <li>The GLP-1 Ownership Protocol</li>
      <li>4-Week Ownership Tracker</li>
      <li>Emergency Action Finder</li>
      <li>Easy Meals Generator</li>
      <li>Craving Response Card</li>
      <li>GLP-1 Myths, Debunked</li>
    </ul>

    <div style="background:#DEEAE0;border-radius:11px;padding:18px 20px;margin:0 0 20px;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;color:#2F6B45;font-weight:700;">YOUR ACCESS</p>
      <p style="margin:0;font-size:14px;line-height:1.6;">Your access links will arrive in a follow-up email shortly.</p>
    </div>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Your purchase is covered by a 30-day money-back guarantee. If it isn't right for you, just reply to this email within 30 days and we'll refund you in full.</p>

    <p style="margin:0;font-size:15px;line-height:1.6;">&mdash; The GLP-1 Ownership team</p>
  </div>

  <p style="max-width:560px;margin:18px auto 0;font-size:11px;line-height:1.6;color:rgba(32,48,31,0.55);">
    The GLP-1 Ownership Protocol is provided for educational and informational purposes only. It is not medical advice and is not intended to diagnose, treat, cure, or prevent any disease or medical condition, or to replace individualized advice from a qualified healthcare professional. Do not start, stop, or change a medication, dose, treatment plan, diet, or exercise program based on this material without consulting an appropriate healthcare professional.
  </p>
</div>`.trim();
}

async function sendConfirmation(toEmail, toName) {
  const firstName = (toName || '').trim().split(/\s+/)[0] || '';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: SENDER,
      replyTo: SENDER,
      to: [toName ? { email: toEmail, name: toName } : { email: toEmail }],
      subject: 'Your GLP-1 Ownership Protocol order is confirmed',
      htmlContent: confirmationHtml(firstName),
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo responded ${response.status}: ${await response.text()}`);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request) {
  // Stripe signs the exact bytes it sent, so read the body as raw text.
  const rawBody = await request.text();

  if (!signatureIsValid(rawBody, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(rawBody);

  if (event.type !== 'checkout.session.completed') {
    return json({ ignored: event.type });
  }

  const details = event.data.object.customer_details || {};
  if (!details.email) {
    return json({ skipped: 'no customer email on session' });
  }

  try {
    await sendConfirmation(details.email, details.name);
  } catch (error) {
    // A non-2xx tells Stripe to retry, which is what we want if Brevo was down.
    console.error('Confirmation email failed:', error.message);
    return json({ error: 'email send failed' }, 500);
  }

  return json({ sent: true });
}
