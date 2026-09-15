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

function resultText(firstName, assetKey, secondaryKey) {
  const a = ASSET[assetKey];
  const secondary = ASSET[secondaryKey];
  const link = SQUEEZE_URL + '?asset=' + encodeURIComponent(assetKey);

  const lines = [
    firstName ? `Hi ${firstName},` : 'Hi,',
    '',
    "Here's the copy of your Ownership profile, as promised.",
    '',
    `Your answers point to ${a.label}.`,
    '',
    a.line,
    '',
    'What building it looks like:',
    ...a.builds.map((b) => `- ${b}`),
  ];

  if (secondary) {
    lines.push(
      '',
      `${secondary.label} came in close behind, so keep it in view. Starting in one place beats spreading yourself across four.`
    );
  }

  lines.push(
    '',
    'One thing worth saying: this quiz is a directional read, not a full assessment. The Ownership Protocol scores all four assets properly and turns the weakest one into a focused 4-week plan, if you want to go further:',
    link,
    '',
    '- The GLP-1 Ownership Team',
    '',
    '---',
    'Educational and informational purposes only. Not medical advice, and not intended to diagnose, treat, cure, or prevent any disease or medical condition, or to replace individualized advice from a qualified healthcare professional. Do not start, stop, or change a medication, dose, treatment plan, diet, or exercise program based on this without consulting an appropriate healthcare professional.'
  );

  return lines.join('\n');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Plain-text shaped so Gmail reads this as the requested delivery it is,
// rather than a promotion. The HTML part mirrors the text exactly: no
// buttons, no colour blocks, just a bare link.
function resultHtml(firstName, assetKey, secondaryKey) {
  const text = resultText(firstName, assetKey, secondaryKey);
  const link = SQUEEZE_URL + '?asset=' + encodeURIComponent(assetKey);
  const body = escapeHtml(text)
    .replace(escapeHtml(link), `<a href="${link}">${link}</a>`)
    .replace(/\n/g, '<br>');
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;">${body}</div>`;
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
      textContent: resultText(firstName, assetKey, secondaryKey),
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
