/**
 * DEMO MODE: a scripted conversation used when APP_MODE is demo,
 * so the website can be shown before it is connected to the clinic. It
 * walks through the same steps as the real assistant (treatment, times,
 * details, confirm) and books nothing.
 */
import { clinic, dentists, services } from '@/content/clinic';
import { dictionaries, type Lang } from './i18n';
import { replyLanguage } from './chat-language';
import { LOCALE, minutes, money } from './format';
import type { ChatRequest, ChatResponse, DemoState } from './chat-types';

const S = {
  en: {
    which: 'Which treatment would you like? Tap one, or tell me in your own words.',
    treatments: 'Treatments', times: 'Free times',
    timesFor: 'Here are the next free times for *{service}*{dentist}. Tap the one that suits you:',
    withDentist: ' with {name}',
    details: '*{slot}* — lovely. To hold it, please send the patient’s *full name*, *mobile number* and *email* in one message.',
    check: 'Please check your booking:', treatment: 'Treatment', when: 'When', patient: 'Patient',
    confirm: 'Confirm', change: 'Change',
    done: 'You’re booked! Your confirmation is on its way by email. (Demo: nothing was really booked.)',
    hours: '*Opening hours*', closed: 'Closed', find: 'You’ll find us at {address}.',
    talk: 'You can call the clinic on *{phone}*. Shall I book you an appointment instead?',
    book: 'Book appointment',
    voice: 'Demo mode: voice messages are understood once the website is connected to the clinic. Please type your message for now.',
    formDone: 'Booked! (Demo: nothing was really booked.)',
    manage: 'You can see or cancel your appointments right here in the chat. Tap one of these:',
  },
  ur: {
    which: 'Aap kaunsa ilaaj karwana chahte hain? Koi option chunein ya apne alfaaz mein batayein.',
    treatments: 'Ilaaj', times: 'Available times',
    timesFor: '*{service}*{dentist} ke liye yeh times available hain. Kaunsa waqt munasib hai?',
    withDentist: ' ({name} ke saath)',
    details: '*{slot}* ke liye patient ka *poora naam*, *mobile number* aur *email* batayein.',
    check: 'Apni booking check kar lein:', treatment: 'Ilaaj', when: 'Waqt', patient: 'Patient',
    confirm: 'Confirm', change: 'Tabdeel karein',
    done: 'Demo booking mukammal hai. Asal appointment book nahi hui aur email nahi bheji gayi.',
    hours: '*Clinic ke auqat*', closed: 'Band', find: 'Hamara pata: {address}',
    talk: 'Aap clinic ko *{phone}* par call kar sakte hain. Kya appointment book karna chahenge?',
    book: 'Appointment book karein',
    voice: 'Demo mode mein voice messages process nahi hote. Filhaal apna paigham type karein.',
    formDone: 'Demo booking mukammal hai. Asal appointment book nahi hui.',
    manage: 'Aap apni appointments yahin dekh ya cancel kar sakte hain. Kaunsa option chahenge?',
  },
  ar: {
    which: 'ما العلاج المطلوب؟ يمكن اختيار أحد الخيارات أو كتابته بكلماتك.',
    treatments: 'العلاجات', times: 'المواعيد المتاحة',
    timesFor: 'هذه أقرب المواعيد المتاحة لـ *{service}*{dentist}. يرجى اختيار الموعد المناسب:',
    withDentist: ' مع {name}',
    details: '*{slot}* اختيار موفق. لتثبيت الموعد، يرجى إرسال *الاسم الكامل* للمريض و*رقم الجوال* و*البريد الإلكتروني* في رسالة واحدة.',
    check: 'يرجى مراجعة تفاصيل الحجز:', treatment: 'العلاج', when: 'الموعد', patient: 'المريض',
    confirm: 'تأكيد', change: 'تعديل',
    done: 'تم الحجز! يصل التأكيد بالبريد الإلكتروني. (وضع تجريبي: لم يتم أي حجز فعلي.)',
    hours: '*ساعات العمل*', closed: 'مغلق', find: 'العنوان: {address}',
    talk: 'يمكن الاتصال بالعيادة على الرقم *{phone}*. هل أحجز لك موعداً بدلاً من ذلك؟',
    book: 'حجز موعد',
    voice: 'وضع تجريبي: ستُفهم الرسائل الصوتية بعد ربط الموقع بالعيادة. يرجى كتابة رسالتك حالياً.',
    formDone: 'تم الحجز! (وضع تجريبي: لم يتم أي حجز فعلي.)',
    manage: 'يمكنك عرض مواعيدك أو إلغاؤها هنا في المحادثة. اختر أحد الخيارين:',
  },
} satisfies Record<Lang, Record<string, string>>;

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const has = (msg: string, phrase: string) => phrase.length > 1 && norm(msg).includes(norm(phrase));

function findService(msg: string) {
  return services.find(s => (Object.values(s.name) as string[]).some(n => has(msg, n)) || has(msg, s.id));
}
function findDentist(msg: string) {
  return dentists.find(d => has(msg, d.name) || has(msg, d.name.replace(/^Dr\.?\s*/i, '').split(' ')[0]));
}

/** Six example times over the next working days (Sunday closed), shown in the clinic's time zone. */
function slots(lang: Lang, dentistId?: string) {
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });
  const times = ['10:30', '12:00', '16:30'];
  const pool = dentistId ? dentists.filter(d => d.id === dentistId) : dentists;
  const out: { title: string; subtitle: string; value: string }[] = [];
  const day = new Date();
  let k = 0;
  while (out.length < 6) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() === 0) continue;
    for (const t of times.slice(0, 2 + (k % 2))) {
      if (out.length >= 6) break;
      const d = pool[k++ % pool.length];
      const title = `${fmt.format(day)} · ${t}`;
      out.push({ title, subtitle: d.name, value: `${title} — ${d.name}` });
    }
  }
  return out;
}

const base = (lang: string, state: DemoState): ChatResponse => ({
  ok: true, reply: '', quickReplies: [], carousel: null, booking: null, note: '', lang, demo: true, demoState: state,
});

export function demoReply(req: ChatRequest): ChatResponse {
  const responseLanguage = replyLanguage(req.message, req.lang, req.history);
  const lang: Lang = 'en'; // Proper names and dates in Roman Urdu use Latin characters.
  const s = S[responseLanguage === 'roman-ur' ? 'ur' : 'en'];
  const t = dictionaries[lang];
  const msg = req.message;
  const st: DemoState = req.demoState && typeof req.demoState === 'object' ? req.demoState : { step: 'start' };
  const starters = t.chat.starters;

  // A voice message: understood only once the site is in live mode
  if (req.audio) return { ...base(responseLanguage, st), reply: s.voice, heard: '' };

  // The booking panel: the visitor already chose everything and confirmed
  if (/^BOOKING FORM/.test(msg)) {
    const field = (k: string) => (msg.match(new RegExp(`^${k}: (.*)$`, 'm'))?.[1] ?? '').replace(/\s*\(id [^)]*\)\s*$/, '').trim();
    const when = `${field('Date').replace(/^\S+\s*\(|\)$/g, '')} · ${field('Time').replace(/^\S+\s*\(|\)$/g, '')}`;
    return { ...base(responseLanguage, { step: 'start' }), reply: s.formDone,
      booking: { reference: 'DEMO-' + Math.random().toString(36).slice(2, 6).toUpperCase(), when, service: field('Treatment'),
        dentist: field('Dentist'), whatsappSent: false, emailCopy: true } };
  }

  // Questions that can come at any point
  // Seeing or cancelling an appointment happens in the chat window itself: offer its two buttons
  if (/\b(cancel|cancell?ation|my appointments?|my booking|reschedule)\b/i.test(msg) || /منسوخ|کینسل|إلغاء|مواعيدي|میری اپائنٹمنٹ/.test(msg)) {
    return { ...base(responseLanguage, { step: 'start' }), reply: s.manage,
      quickReplies: [{ title: starters[1], value: starters[1] }, { title: starters[2], value: starters[2] }] };
  }
  if (/\b(hours?|open|timings?|location|address|where)\b/i.test(msg) || /اوقات|پتہ|ساعات|العنوان|الموقع/.test(msg)) {
    const hours = clinic.hours.map(h => `${h.day[lang]}: ${h.time || s.closed}`).join('\n');
    return { ...base(responseLanguage, { step: 'start' }), reply: `${s.hours}\n${hours}\n\n${fill(s.find, { address: clinic.address[lang] })}`,
      quickReplies: [{ title: s.book, value: s.book }] };
  }
  if (/\b(human|person|staff|call|talk)\b/i.test(msg)) {
    return { ...base(responseLanguage, { step: 'start' }), reply: fill(s.talk, { phone: `\u2066${clinic.phone}\u2069` }), quickReplies: [{ title: s.book, value: s.book }] };
  }

  const askTreatment = (dentist?: string): ChatResponse => ({
    ...base(responseLanguage, { step: 'treatment', dentist }), reply: s.which,
    carousel: { label: s.treatments, items: services.map(x => ({
      title: x.name[lang], subtitle: `${minutes(lang, x.minutes, t.treatments.min)} · ${money(lang, x.price, clinic.currency)}`, value: x.name[lang],
    })) },
  });
  const offerTimes = (serviceId: string, dentist?: string): ChatResponse => {
    const sv = services.find(x => x.id === serviceId)!;
    const dn = dentists.find(d => d.id === dentist);
    return { ...base(responseLanguage, { step: 'time', service: serviceId, dentist }),
      reply: fill(s.timesFor, { service: sv.name[lang], dentist: dn ? fill(s.withDentist, { name: dn.name }) : '' }),
      carousel: { label: s.times, items: slots(lang, dentist) } };
  };

  switch (st.step) {
    case 'treatment': {
      const sv = findService(msg);
      return sv ? offerTimes(sv.id, st.dentist) : askTreatment(st.dentist);
    }
    case 'time':
      if (!st.service) return askTreatment();
      return { ...base(responseLanguage, { step: 'details', service: st.service, slot: msg.slice(0, 120) }), reply: fill(s.details, { slot: msg.slice(0, 120) }) };
    case 'details': {
      const sv = services.find(x => x.id === st.service);
      const who = msg.split(/[\n,،]/)[0].trim().slice(0, 60);
      return { ...base(responseLanguage, { ...st, step: 'confirm' }),
        reply: `${s.check}\n*${s.treatment}:* ${sv?.name[lang] ?? ''}\n*${s.when}:* ${st.slot ?? ''}\n*${s.patient}:* ${who}`,
        quickReplies: [{ title: s.confirm, value: s.confirm }, { title: s.change, value: s.change }] };
    }
    case 'confirm': {
      if (!has(msg, s.confirm) && !/\b(yes|ok|confirm)\b/i.test(msg)) return askTreatment();
      const sv = services.find(x => x.id === st.service);
      const [when, dentist = ''] = String(st.slot ?? '').split(' — ');
      const ref = 'DEMO-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      return { ...base(responseLanguage, { step: 'start' }), reply: s.done,
        booking: { reference: ref, when, service: sv?.name[lang] ?? '', dentist, whatsappSent: false, emailCopy: true } };
    }
    default: {
      const sv = findService(msg);
      const dn = findDentist(msg);
      return sv ? offerTimes(sv.id, dn?.id) : askTreatment(dn?.id);
    }
  }
}
