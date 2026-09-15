/* Quiz lead capture.

   The email gate promises "we'll email you a copy too", so this does two
   independent jobs: store the contact in Brevo under the GLP-1 list, and
   send the person their result. Either can fail without blocking the
   other — a failed send should not cost us the lead, and a failed contact
   write should not break a promise made on the page. */

const BREVO_API = 'https://api.brevo.com/v3';
const LIST_NAME = 'glp1-quiz-leads';
const SENDER = { name: 'GLP-1 Ownership', email: 'support@glp1ownership.com' };
const SQUEEZE_URL = 'https://www.glp1ownership.com/';
const ALLOWED_HOSTS = ['www.glp1ownership.com', 'glp1ownership.com'];

const ASSET = {
  muscle: {
    label: 'Muscle',
    line: 'Of the four assets this is the only literally structural one. While weight is coming off, muscle is the thing most worth deliberately protecting.',
    builds: ['Two short resistance sessions a week', 'Protein at your first meal', 'A simple strength check you can repeat'],
  },
  structure: {
    label: 'Structure',
    line: 'Structure is a repeatable eating rhythm that is not organised entirely around whether appetite happens to show up that day.',
    builds: ['Three rough eating anchors', "One repeatable meal you don't rethink", 'Eating on schedule on quiet-appetite days'],
  },
  fuel: {
    label: 'Fuel',
    line: 'When appetite is smaller, a few reliable ways to build a useful meal matter more than focusing on eating less.',
    builds: ['A short go-to list of meals that work', 'A protein-forward first meal', 'A rough sense of your daily protein'],
  },
  situations: {
    label: 'Situations',
    line: 'Stress, travel, restaurants and the weeks where everything happens at once. Situations is about having a response ready before you are standing in one.',
    builds: ['Naming your two or three real triggers', 'Deciding one concrete response in advance', 'Rehearsing it while the stakes are low'],
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function brevo(path, options = {}) {
  return fetch(BREVO_API + path, {
    ...options,
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

// Resolved once per warm instance so a rename can't silently orphan leads.
let cachedListId = null;
async function resolveListId() {
  if (cachedListId) return cachedListId;
  const res = await brevo('/contacts/lists?limit=50');
  if (!res.ok) return null;
  const data = await res.json();
  const match = (data.lists || []).find(
    (l) => (l.name || '').toLowerCase() === LIST_NAME
  );
  cachedListId = match ? match.id : null;
  return cachedListId;
}

async function upsertContact(email, firstName, read) {
  const listId = await resolveListId();
  const res = await brevo('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      email,
      updateEnabled: true,
      ...(listId ? { listIds: [listId] } : {}),
      attributes: {
        FIRSTNAME: firstName || '',
        LIKELY_ASSET: read.likely_asset || '',
        SECONDARY_ASSET: read.secondary_asset || '',
        DESIRED_OUTCOME: read.desired_outcome || '',
        QUIZ_SOURCE: 'ownership-quiz',
      },
    }),
  });
  // 201 created, 204 updated. Anything else is a real failure.
  if (!res.ok && res.status !== 204) {
    throw new Error(`contact upsert ${res.status}: ${await res.text()}`);
  }
}

function resultHtml(firstName, assetKey, secondaryKey) {
  const a = ASSET[assetKey];
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const secondary = ASSET[secondaryKey];
  const link = SQUEEZE_URL + '?asset=' + encodeURIComponent(assetKey);

  return `
<div style="background:#F7F2E4;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#20301F;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid rgba(32,48,31,0.14);border-radius:14px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;color:#B5502E;font-weight:700;">YOUR QUIZ RESULT</p>
    <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;line-height:1.25;color:#20301F;">Your answers point to ${a.label}</h1>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.65;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.65;">Here's the copy of your Ownership profile, as promised.</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.65;">Of the four assets, <strong>${a.label}</strong> looks like the one with the most to build right now. ${a.line}</p>

    <div style="background:#DEEAE0;border-radius:11px;padding:18px 20px;margin:0 0 20px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;color:#2F6B45;font-weight:700;">WHAT BUILDING IT LOOKS LIKE</p>
      <ul style="margin:0;padding-left:18px;font-size:14.5px;line-height:1.8;">
        ${a.builds.map((b) => `<li>${b}</li>`).join('')}
      </ul>
    </div>

    ${secondary ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;">${secondary.label} came in close behind, so keep it in view — but starting in one place beats spreading yourself across four.</p>` : ''}

    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;">This quiz is a directional read, not a full assessment. The Ownership Protocol scores all four assets properly and turns the weakest into a focused 4-week plan.</p>

    <p style="margin:0 0 22px;text-align:center;">
      <a href="${link}" style="display:inline-block;background:#2F6B45;color:#F7F2E4;text-decoration:none;font-weight:700;font-size:15px;padding:15px 28px;border-radius:9px;">See my 4-week Ownership plan</a>
    </p>

    <p style="margin:0;font-size:15px;line-height:1.65;">&mdash; The GLP-1 Ownership Team</p>
  </div>

  <p style="max-width:560px;margin:18px auto 0;font-size:11px;line-height:1.6;color:rgba(32,48,31,0.55);">
    The GLP-1 Ownership Protocol is provided for educational and informational purposes only. It is not medical advice and is not intended to diagnose, treat, cure, or prevent any disease or medical condition, or to replace individualized advice from a qualified healthcare professional. Do not start, stop, or change a medication, dose, treatment plan, diet, or exercise program based on this material without consulting an appropriate healthcare professional.
  </p>
</div>`.trim();
}

async function sendResult(email, firstName, assetKey, secondaryKey) {
  const a = ASSET[assetKey];
  const res = await brevo('/smtp/email', {
    method: 'POST',
    body: JSON.stringify({
      sender: SENDER,
      replyTo: SENDER,
      to: [firstName ? { email, name: firstName } : { email }],
      subject: `Your Ownership profile: ${a.label}`,
      htmlContent: resultHtml(firstName, assetKey, secondaryKey),
    }),
  });
  if (!res.ok) throw new Error(`send ${res.status}: ${await res.text()}`);
}

export async function POST(request) {
  // Public endpoint: keep obvious off-site abuse out.
  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  if (origin) {
    let host = '';
    try { host = new URL(origin).hostname; } catch { host = ''; }
    if (host && !ALLOWED_HOSTS.includes(host)) {
      return json({ error: 'forbidden origin' }, 403);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'invalid email' }, 400);
  }

  const read = body.payload || {};
  const firstName = String(read.first_name || '').trim().slice(0, 60);
  const assetKey = ASSET[read.likely_asset] ? read.likely_asset : null;
  const secondaryKey = ASSET[read.secondary_asset] ? read.secondary_asset : null;

  // Without a recognised asset there is no result to send, so don't claim we sent one.
  const emailAttempted = Boolean(assetKey);

  const results = await Promise.allSettled([
    upsertContact(email, firstName, read),
    emailAttempted ? sendResult(email, firstName, assetKey, secondaryKey) : Promise.resolve(),
  ]);

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(i === 0 ? 'Contact upsert failed:' : 'Result email failed:', r.reason?.message);
    }
  });

  return json({
    stored: results[0].status === 'fulfilled',
    emailed: emailAttempted && results[1].status === 'fulfilled',
  });
}
