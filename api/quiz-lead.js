// Vercel serverless function: POST /api/quiz-lead
// Zet een quizdeelnemer als contact in Resend en start de mailreeks (automation).
//
// Nodig in Vercel (website-project): RESEND_API_KEY  (Full access)
// Optioneel:                          RESEND_SEGMENT_ID (segment "Quiz" voor latere broadcasts)

const RESEND = 'https://api.resend.com';
const EVENT_NAME = 'quiz.voltooid'; // moet gelijk zijn aan de trigger van de automation in Resend
const PROFIELEN = ['weekendwisselaar', 'ongemerkte-snacker', 'alles-of-niets-starter', 'drukke-doener'];

async function resend(path, body) {
  const r = await fetch(RESEND + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY ontbreekt');
    return res.status(500).json({ ok: false });
  }

  const b = req.body || {};

  // Honeypot: echte bezoekers zien dit veld niet. Bots vullen het in -> stil negeren.
  if (b.website) return res.status(200).json({ ok: true });

  const voornaam = String(b.voornaam || '').trim().slice(0, 50);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
  const profiel = String(b.profiel || '');

  if (!voornaam || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !PROFIELEN.includes(profiel) || b.toestemming !== true) {
    return res.status(400).json({ ok: false });
  }

  // 1. Contact aanmaken (met voornaam, nodig voor {{{FIRST_NAME}}} in de mails).
  //    Bestaat het contact al, dan geeft Resend een fout terug: geen probleem, we gaan gewoon verder.
  const contact = { email, first_name: voornaam, unsubscribed: false };
  if (process.env.RESEND_SEGMENT_ID) contact.segments = [{ id: process.env.RESEND_SEGMENT_ID }];
  const c = await resend('/contacts', contact);
  if (!c.ok) console.warn('Contact niet aangemaakt', c.status, c.text);

  // 2. Event sturen -> start de automation met de mailreeks.
  const e = await resend('/events/send', {
    event: EVENT_NAME,
    email,
    payload: {
      profiel,
      voornaam,
      toestemming_op: new Date().toISOString(), // bewijs van toestemming (GDPR)
    },
  });
  if (!e.ok) {
    console.error('Event niet verstuurd', e.status, e.text);
    return res.status(502).json({ ok: false });
  }

  return res.status(200).json({ ok: true });
};
