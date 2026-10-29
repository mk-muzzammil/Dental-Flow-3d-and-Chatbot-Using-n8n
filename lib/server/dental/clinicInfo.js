import { openingForWeekday } from './availability';
// Deterministic port of workflow 15 / Build Answer.
export function buildClinicInfo(c, res, faqRes, specRes) {
  /* CLINIC INFO: what the assistant is allowed to say about the clinic.

   Everything comes from the Google Sheet, so reception controls every word:
     Services  A id | B name | C minutes | D price | E active | F name_ar | G name_ur
     Hours     A day | B open | C close | D break_start | E break_end | F closed | G doctor
     Settings  key | value
     FAQ       A topic | B question | C answer_en | D answer_ar | E answer_ur | F active
     Doctors   A doctor_id | B name | C calendar_id | D services | E email | F active | G specializations
     Specializations  A specialization_id | B name_en | C name_ar | D name_ur | E active
     Services  H specialization_id
   The Specializations tab and the two specialization columns are new in
   stage 4. They are read on their own, so a sheet that does not have them
   yet still gets everything else.

   view=prompt  the block for the assistant's instructions: clinic details,
                opening hours, treatments, dentists, specializations and the
                approved FAQ answers. With all of that in front of it, the
                assistant answers clinic questions and offers dentists without
                calling a tool, which is one whole round trip faster.
   view=faq     the approved answers, in the language asked for (English when
                that language's answer is empty), plus opening hours and prices. */
  const code = Number(res.statusCode || 0);
  const FAQ_INLINE_CHARS = 7000; // approved answers longer than this in total stay behind get_faq
  const clean = (v) => String(v ?? '').trim();

  if (!(code >= 200 && code < 300)) {
    const why =
      clean(res.body && res.body.error && res.body.error.message) || `HTTP ${code || 'no response'}`;
    return {
      ok: false,
      promptBlock: '',
      faq: [],
      error: why,
      message:
        'The clinic information could not be read (check SHEET_ID and the Google Sheets credential in clinic integration settings). ' +
        'Tell the patient you will check with the team; do not guess.',
    };
  }

  const vr = (res.body && res.body.valueRanges) || [];
  const rows = (i) => (vr[i] && vr[i].values) || []; // 0 Services 1 Hours 2 Settings 3 Doctors
  const faqOk = Number(faqRes.statusCode || 0) >= 200 && Number(faqRes.statusCode || 0) < 300;
  const faqRows = faqOk ? (faqRes.body && faqRes.body.values) || [] : [];
  const off = (v) => clean(v).toUpperCase() === 'FALSE';
  const set = {};
  for (const r of rows(2)) set[clean(r[0])] = r[1];

  const clinic = {
    name: clean(set.clinic_name) || c.CLINIC_NAME,
    address: clean(set.clinic_address) || c.CLINIC_ADDRESS,
    phone: clean(set.clinic_phone) || c.CLINIC_PHONE,
    mapUrl: clean(set.clinic_map_url) || c.CLINIC_MAP_URL,
  };
  const currency = clean(set.currency) || c.CURRENCY;
  const dl = clean(set.default_language).toLowerCase();
  const defaultLanguage = /^ar/.test(dl)
    ? 'Arabic'
    : /roman/.test(dl)
      ? 'Roman Urdu'
      : /^ur/.test(dl)
        ? 'Urdu'
        : 'English';

  // The stage 4 read: 0 Specializations A:E, 1 Doctors column G, 2 Services column H (row for row with the tabs above).
  const okSpec = Number(specRes.statusCode || 0) >= 200 && Number(specRes.statusCode || 0) < 300;
  const sr = (i) =>
    (okSpec &&
      specRes.body &&
      specRes.body.valueRanges &&
      specRes.body.valueRanges[i] &&
      specRes.body.valueRanges[i].values) ||
    [];
  const docSpec = sr(1),
    svcSpec = sr(2);

  const services = rows(0)
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => clean(r[0]) && !off(r[4]))
    .map(({ r, i }) => ({
      id: clean(r[0]),
      en: clean(r[1]),
      ar: clean(r[5]),
      ur: clean(r[6]),
      minutes: Number(r[2]) || null,
      price: Number(r[3]) || null,
      spec: clean((svcSpec[i] || [])[0]).toLowerCase(),
    }));

  // Opening hours: the clinic's own rows (no doctor named), as written in the sheet.
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const isClosed = (r) => clean(r[5]).toUpperCase() === 'TRUE' || !clean(r[1]) || !clean(r[2]);
  const hhmm = (v) => clean(v).replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
  const clinicHours = rows(1).filter((r) => clean(r[0]) && !clean(r[6]));
  const hoursLine = clinicHours
    .map((r) =>
      isClosed(r)
        ? `${clean(r[0])} closed`
        : `${clean(r[0])} ${hhmm(r[1])}-${hhmm(r[2])}` +
          (clean(r[3]) && clean(r[4]) ? ` (break ${hhmm(r[3])}-${hhmm(r[4])})` : ''),
    )
    .join('; ');

  // Dentists, with the same rules as the booking engine: a dentist needs an id,
  // a calendar and active not FALSE; none of those means one dentist on the
  // clinic calendar. A dentist with hours rows of their own works only those days.
  const specs = sr(0)
    .filter((r) => clean(r[0]) && !off(r[4]))
    .map((r) => ({
      id: clean(r[0]).toLowerCase(),
      en: clean(r[1]) || clean(r[0]),
      ar: clean(r[2]),
      ur: clean(r[3]),
    }));
  const specIds = new Set(specs.map((s) => s.id));
  const list = (v) =>
    clean(v)
      .toLowerCase()
      .split(/[\s,;]+/)
      .filter(Boolean);
  const dentists = rows(3)
    .map((r, i) => ({
      id: clean(r[0]).toLowerCase(),
      name: clean(r[1]) || clean(r[0]),
      calendarId: clean(r[2]),
      services: clean(r[3]).toLowerCase(),
      active: r[5] === undefined || !off(r[5]),
      specs: list((docSpec[i] || [])[0]).filter((x) => specIds.has(x)),
    }))
    .filter((d) => d.id && d.calendarId && d.active);
  const does = (d, id) =>
    !d.services || d.services === 'all' || list(d.services).includes(String(id).toLowerCase());
  const worksOn = (d) => {
    return DAYS.flatMap(day => {
      const opening = openingForWeekday(rows(1), d.id, day);
      return opening ? [`${day} ${opening.open}-${opening.close}${opening.breaks.length ? ' (breaks '+opening.breaks.map(b=>b.join('-')).join(', ')+')' : ''}`] : [];
    });
  };

  const topics = [],
    faqAll = [];
  for (const r of faqRows) {
    const topic = clean(r[0]);
    if (!topic || off(r[5]) || topic.startsWith('#')) continue; // a row starting with # is a note
    const ans = { en: clean(r[2]), ar: clean(r[3]), ur: clean(r[4]) };
    if (!ans.en && !ans.ar && !ans.ur) continue;
    topics.push(topic);
    faqAll.push({ topic, question: c.lang === 'ur' && clean(r[6]) ? clean(r[6]) : clean(r[1]), ans });
  }

  if (c.view === 'prompt') {
    // The approved answers go straight into the instructions when they are short enough.
    const one = (v) => clean(v).replace(/\s+/g, ' ');
    const answers = faqAll.map(
      (f) =>
        `- ${f.topic}` +
        (f.question ? ` (${one(f.question)})` : '') +
        ': ' +
        [
          f.ans.en && `EN: ${one(f.ans.en)}`,
          f.ans.ar && `AR: ${one(f.ans.ar)}`,
          f.ans.ur && `UR: ${one(f.ans.ur)}`,
        ]
          .filter(Boolean)
          .join(' | '),
    );
    const faqInline = faqAll.length > 0 && answers.join('\n').length <= FAQ_INLINE_CHARS;
    const faqLines = !faqAll.length
      ? ['FAQ ANSWERS ON FILE: none']
      : faqInline
        ? ['FAQ ANSWERS ON FILE (approved by the clinic):', ...answers]
        : [`FAQ TOPICS ON FILE (call get_faq for the answers): ${topics.join(', ')}`];
    const promptBlock = [
      `CLINIC: ${clinic.name} | Address: ${clinic.address} | Phone: ${clinic.phone}` +
        (clinic.mapUrl ? ` | Map link: ${clinic.mapUrl}` : ' | Map link: none on file'),
      ...(clean(set.clinic_name_ar) || clean(set.clinic_name_ur)
        ? [
            `Clinic name in Arabic: ${clean(set.clinic_name_ar) || '-'} | in Urdu: ${clean(set.clinic_name_ur) || '-'}`,
          ]
        : []),
      `DEFAULT LANGUAGE: ${defaultLanguage}`,
      `Prices are in ${currency}.`,
      '',
      'TREATMENTS: id = English name | Arabic name | Urdu name · length · price',
      ...services.map(
        (s) =>
          `${s.id} = ${s.en} | ${s.ar || '-'} | ${s.ur || '-'} · ${s.minutes} min` +
          (s.price ? ` · ${s.price.toLocaleString('en-US')}` : '') +
          (s.spec && specIds.has(s.spec) && dentists.length ? ` · ${s.spec}` : ''),
      ),
      '',
      `OPENING HOURS (the clinic in general, 24-hour clock): ${hoursLine || 'not on file'}`,
      '',
      ...(dentists.length
        ? [
            'DENTISTS: id = name · specializations · treatments they do · working days and hours (not availability)',
            ...dentists.map(
              (d) =>
                `${d.id} = ${d.name} · ${d.specs.length ? d.specs.join(', ') : 'none listed'} · ` +
                `${
                  !d.services || d.services === 'all'
                    ? 'all treatments'
                    : services
                        .filter((s) => does(d, s.id))
                        .map((s) => s.id)
                        .join(', ') || 'none'
                } · ` +
                `${worksOn(d).join(' ') || 'no days on file'}`,
            ),
          ]
        : [
            'DENTISTS: one dentist only. Do not mention a dentist\'s name, do not ask which dentist, and always use doctor "any".',
          ]),
      ...(specs.length && dentists.length
        ? [
            '',
            'SPECIALIZATIONS: id = English name | Arabic name | Urdu name',
            ...specs.map((s) => `${s.id} = ${s.en} | ${s.ar || '-'} | ${s.ur || '-'}`),
          ]
        : []),
      '',
      ...faqLines,
    ].join('\n');
    return {
      ok: true,
      promptBlock,
      treatments: services.length,
      topics: topics.length,
      faqTab: faqOk,
      faqInline,
      dentists: dentists.length,
      specializations: specs.length,
    };
  }

  // ---- view=faq ---------------------------------------------------------------
  const L = c.lang === 'ar' ? 'ar' : c.lang === 'ur' ? 'ur' : 'en'; // Roman Urdu reads the English answer and rewords it
  const openingHours = rows(1)
    .filter((r) => clean(r[0]) && !clean(r[6]))
    .map((r) => {
      const closed = clean(r[5]).toUpperCase() === 'TRUE' || !clean(r[1]) || !clean(r[2]);
      return closed
        ? { day: clean(r[0]), closed: true }
        : {
            day: clean(r[0]),
            open: clean(r[1]),
            close: clean(r[2]),
            ...(clean(r[3]) && clean(r[4]) ? { break: `${clean(r[3])}-${clean(r[4])}` } : {}),
          };
    });
  return {
    ok: true,
    language: c.lang,
    clinic,
    currency,
    openingHours,
    treatments: services.map((s) => ({ id: s.id, name: s[L] || s.en, minutes: s.minutes, price: s.price })),
    faq: faqAll.map((f) => ({
      topic: f.topic,
      question: f.question,
      answer: f.ans[L] || f.ans.en || f.ans.ar || f.ans.ur,
      ...(f.ans[L] ? {} : { answerIsIn: f.ans.en ? 'en' : f.ans.ar ? 'ar' : 'ur' }),
    })),
    ...(faqOk
      ? {}
      : {
          faqNote:
            'The FAQ tab could not be read (check the FAQ tab). Only the clinic details, hours and prices here are available.',
        }),
    rules:
      "Answer only from this data, in the patient's language. openingHours are the clinic's general hours in 24-hour time; " +
      'each dentist may work fewer days. If the answer is not here, say you will check with the team. Never guess.',
  };
}
