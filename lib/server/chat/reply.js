// Deterministic response formatting ported from workflow 17.
export function prepareReply(c, j, heard) {
  /* The assistant's reply, turned into what the website's chat window shows:
     reply         the text (with *bold*)
     quickReplies  up to 3 buttons                    ([buttons] A | B | C)
     carousel      a row of cards to scroll through   ([list: Label] Title ~ second line | ...)
     booking       the confirmed booking, when one was just made, for the success card
     note          the exact dates behind the times offered, kept with the chat
   Tapping a button or a card sends its "value" back as the visitor's message. */

  const raw = j.output;
  const out = Array.isArray(raw)
    ? raw.map((x) => (typeof x === 'string' ? x : x && typeof x.text === 'string' ? x.text : '')).join('')
    : raw && typeof raw === 'object'
      ? String(raw.text || '')
      : String(raw || '');
  const steps = Array.isArray(j.intermediateSteps) ? j.intermediateSteps : [];
  const seen = steps.map((st) => {
    let obs = st ? st.observation : null;
    if (typeof obs === 'string') {
      try {
        obs = JSON.parse(obs);
      } catch (e) {
        obs = null;
      }
    }
    if (Array.isArray(obs)) obs = obs[0];
    return {
      tool: String((st && st.action && st.action.tool) || ''),
      obs: obs && typeof obs === 'object' ? obs : null,
    };
  });

  const OPT = /^\s*\[\s*(buttons?|list)\s*(?::\s*([^\]]*))?\]\s*(.*)$/i;
  const isFlag = (l) => /^\s*\**\s*ESCALATE\s*:/i.test(l);
  let kind = null,
    label = '',
    options = [];
  const kept = [];
  for (const l of out.split('\n')) {
    if (isFlag(l)) continue;
    const m = OPT.exec(l);
    if (m) {
      if (!kind) {
        kind = /^button/i.test(m[1]) ? 'buttons' : 'list';
        label = (m[2] || '').trim();
        options = m[3]
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10)
          .map((s) => {
            const [t, ...d] = s.split('~');
            return { title: t.trim(), desc: d.join('~').trim() };
          })
          .filter((o) => o.title);
      }
      continue;
    }
    kept.push(l);
  }
  let reply = kept
    .join('\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const sample = reply + ' ' + options.map((o) => o.title).join(' ');
  const lang = /[؀-ۿ]/.test(sample)
    ? /[ٹڈڑںےہھگچپکی]/.test(sample)
      ? 'ur'
      : 'ar'
    : c.uiLang === 'roman-ur'
      ? 'en'
      : 'en';
  const SORRY = {
    en: `Sorry, I couldn't put a reply together just now. Please try again, or call us on ${c.CLINIC_PHONE}.`,
    ar: `عذراً، تعذّر تجهيز الرد الآن. يرجى المحاولة مرة أخرى أو الاتصال بنا على الرقم ‎${c.CLINIC_PHONE}`,
    ur: `معذرت، اس وقت جواب تیار نہیں ہو سکا۔ براہِ کرم دوبارہ کوشش کریں یا ہمیں کال کریں: ‎${c.CLINIC_PHONE}`,
  };
  const failed = !reply && !options.length;
  if (failed) reply = SORRY[c.uiLang === 'ar' || c.uiLang === 'ur' ? c.uiLang : 'en'];

  const value = (o) => (o.desc ? `${o.title} — ${o.desc}` : o.title);
  const quickReplies =
    kind === 'buttons' && options.length <= 3 && options.every((o) => !o.desc)
      ? options.map((o) => ({ title: o.title, value: o.title }))
      : [];
  const carousel =
    options.length && !quickReplies.length
      ? {
          label: label || '',
          items: options.map((o) => ({ title: o.title, subtitle: o.desc, value: value(o) })),
        }
      : null;

  const done = seen
    .filter((x) => x.tool === 'create_booking' && x.obs && x.obs.ok === true && x.obs.reference)
    .pop();
  const booking = done
    ? {
        reference: String(done.obs.reference),
        when: String(done.obs.when || ''),
        service: String(done.obs.service || ''),
        dentist: String(done.obs.dentist || ''),
        whatsappSent: false,
        emailCopy: done.obs.emailCopy === true,
      }
    : null;
  const offered = seen
    .filter((x) => x.obs && x.obs.next === true && Array.isArray(x.obs.options) && x.obs.options.length)
    .pop();
  const note = !offered
    ? ''
    : '[Times offered, for your own use when booking: ' +
      offered.obs.options
        .slice(0, 10)
        .map((o) => `"${o.label}" = ${o.date} ${o.time}` + (o.doctor ? ` with ${o.doctor}` : ''))
        .join('; ') +
      ']';

  // For a voice message: the words that were heard, shown back under the visitor's voice bubble.
  let heardText = '';
  if (c.isVoice) heardText = heard && heard.heard ? String(heard.said || '') : '';
  return {
    response: {
      ok: !failed,
      reply,
      quickReplies,
      carousel,
      booking,
      note,
      lang: failed ? c.uiLang : lang,
      heard: heardText,
    },
    modelError: j.error ? String(j.error.message || j.error) : '',
  };
}
