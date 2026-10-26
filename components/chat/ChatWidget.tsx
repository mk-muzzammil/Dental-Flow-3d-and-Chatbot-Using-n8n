'use client';
/**
 * THE CHAT WINDOW (bottom corner of every page).
 *
 * - Sends each message to /api/chat (this website's server), which passes it
 *   to the clinic's assistant in Next.js and returns its answer as JSON.
 * - Shows the answer's buttons (quickReplies) and scrolling cards (carousel);
 *   tapping one sends its value as the visitor's next message.
 * - Shows "Assistant is typing…" while waiting, and a booking card when an
 *   appointment is confirmed.
 * - Keeps the chat in this browser (localStorage) for 24 hours, so a visitor
 *   who reloads the page carries on where they were.
 * - "Book appointment" (and every Book button on the page) opens the booking
 *   panel: treatment, dentist and time are chosen there, one under another,
 *   and only Confirm sends a message.
 * - The microphone button records a voice message; the assistant listens to
 *   it on the server and the words it heard are shown under the voice bubble.
 * - "View My Appointments" and "Cancel an Appointment" run here, without the
 *   assistant: the visitor types the mobile number or email they booked with,
 *   their upcoming appointments appear as cards (/api/appointments), and a card's Cancel asks "Are you sure?" first. The number
 *   or email is kept in memory only, never in the browser's storage.
 * - Other parts of the page open it with openChat() from sections/ui.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Booking, Carousel, ChatResponse, DemoState, HistoryItem, QuickReply } from '@/lib/chat-types';
import { dictionaries, fill, type Dict, type Lang } from '@/lib/i18n';
import { readContact, type Appointment, type AppointmentsAnswer, type Contact } from '@/lib/appointments';
import { AppointmentCards } from './Appointments';
import { OPEN_CHAT_EVENT, type OpenChatDetail } from '../sections/ui';
import { Avatar, BookingCard, Carousel as CarouselView, QuickReplies, RichText, Typing } from './parts';
import { BookingPanel, requestMessage, type BookingRequest, type PanelStart } from './BookingPanel';
import { MAX_SECONDS, useVoice } from './useVoice';
import { clock, dayTitle } from '@/lib/slots';

type Extra = { idempotencyKey?: string; audio?: { mime: string; data: string }; voice?: { seconds: number; url?: string }; request?: BookingRequest };

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** what was actually sent, when a button showed a shorter title */
  sent?: string;
  quickReplies?: QuickReply[];
  carousel?: Carousel | null;
  booking?: Booking | null;
  note?: string;
  demo?: boolean;
  error?: boolean;
  /** why it failed: only sent while the site runs on your own computer (npm run dev) */
  detail?: string;
  /** the visitor's message to send again when "Try again" is tapped */
  retry?: string;
  /** a voice message: its length (and, during this visit, the recording to play back) */
  voice?: { seconds: number; url?: string };
  /** the words the assistant heard in a voice message */
  heard?: string;
  /** a booking sent from the booking panel, shown as a card */
  request?: BookingRequest;
  /** the visitor's appointments, shown as cards ("key" ties them to the number or email looked up during this visit) */
  appts?: { purpose: 'view' | 'cancel'; items: Appointment[]; key: string };
};

/** the menu buttons, in every language the assistant may write them in (it can answer in Roman Urdu too) */
type Action = 'book' | 'view' | 'cancel' | 'never' | 'another';
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const ACTIONS: [Action, string[]][] = [
  ['book', ['book appointment', 'nayi appointment book karein', ...Object.values(dictionaries).flatMap(d => [d.chat.starters[0]])]],
  ['view', ['meri appointments dekhein', ...Object.values(dictionaries).map(d => d.chat.starters[1])]],
  ['cancel', ['appointment cancel karein', ...Object.values(dictionaries).map(d => d.chat.starters[2])]],
  ['never', Object.values(dictionaries).map(d => d.chat.neverMind)],
  ['another', Object.values(dictionaries).map(d => d.chat.tryAnother)],
];
const actionOf = (title: string): Action | null => {
  const n = norm(title);
  return ACTIONS.find(([, labels]) => labels.some(l => norm(l) === n))?.[0] ?? null;
};

const STORE_KEY = 'dentalflow-chat:v1';
const KEEP_MS = 24 * 3600_000;

const uid = () => {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
};

function load(): { sessionId: string; msgs: Msg[]; demoState: DemoState | null } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.sessionId !== 'string' || !Array.isArray(v.msgs) || Date.now() - Number(v.savedAt || 0) > KEEP_MS) return null;
    return { sessionId: v.sessionId, msgs: v.msgs.slice(-60), demoState: v.demoState ?? null };
  } catch { return null; }
}
function save(sessionId: string, msgs: Msg[], demoState: DemoState | null) {
  // recordings are never stored: only their length, and the words that were heard
  const keep = msgs.slice(-60).map(m => (m.voice ? { ...m, voice: { seconds: m.voice.seconds } } : m));
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ sessionId, msgs: keep, demoState, savedAt: Date.now() })); } catch { /* storage off: the chat still works for this visit */ }
}

/** The chat so far, in the form the assistant reads: its own options are written back the way it wrote them. */
function toHistory(msgs: Msg[]): HistoryItem[] {
  const out: HistoryItem[] = [];
  for (const m of msgs) {
    if (m.error) continue;
    if (m.role === 'user') {
      const text = m.voice ? (m.heard ? `(voice message) ${m.heard}` : '(voice message)') : m.sent || m.text;
      out.push({ role: 'user', text });
      continue;
    }
    let text = m.text;
    if (m.quickReplies?.length) text += `\n[buttons] ${m.quickReplies.map(q => q.title).join(' | ')}`;
    if (m.carousel?.items.length) text += `\n[list${m.carousel.label ? `: ${m.carousel.label}` : ''}] ${m.carousel.items.map(i => i.subtitle ? `${i.title} ~ ${i.subtitle}` : i.title).join(' | ')}`;
    if (m.booking) text += `\n(Booked: ${m.booking.reference}, ${m.booking.when})`;
    if (m.appts) text += `\n(Their appointments, shown as cards: ${m.appts.items.map(a => `${a.reference} ${a.service} ${a.date} ${a.time}${a.dentist ? ' with ' + a.dentist : ''} - ${a.status}`).join('; ') || 'none'})`;
    if (text.trim()) out.push({ role: 'assistant', text: text.trim() });
    if (m.note) out.push({ role: 'note', text: m.note });
  }
  return out.slice(-20);
}

export function ChatWidget({ lang, t, phone, minWord }: { lang: Lang; t: Dict['chat']; phone: string; minWord: string }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [teaser, setTeaser] = useState(false);
  const session = useRef('');
  const demoState = useRef<DemoState | null>(null);
  const msgsRef = useRef<Msg[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const ready = useRef(false);

  // restore the chat kept in this browser, and ask the site whether the chat is connected to the clinic.
  // A chat that was kept from demo mode is not carried over into the real one (and the other way round).
  const [serverDemo, setServerDemo] = useState<boolean | null>(null);
  const serverDemoRef = useRef<boolean | null>(null);
  useEffect(() => { serverDemoRef.current = serverDemo; }, [serverDemo]);
  useEffect(() => {
    const kept = load();
    session.current = kept?.sessionId ?? uid();
    demoState.current = kept?.demoState ?? null;
    if (kept?.msgs.length) setMsgs(kept.msgs);
    ready.current = true;
    fetch('/api/chat', { cache: 'no-store' }).then(r => r.json()).then((d: { demo?: boolean }) => {
      const demo = d?.demo === true;
      setServerDemo(demo);
      const wrong = (kept?.msgs ?? []).some(m => m.role === 'assistant' && !m.error && !!m.demo !== demo);
      if (wrong) { session.current = uid(); demoState.current = null; setMsgs([]); }
    }).catch(() => setServerDemo(null));
  }, []);
  useEffect(() => {
    msgsRef.current = msgs;
    if (ready.current) save(session.current, msgs, demoState.current);
  }, [msgs]);

  // a small "hello" bubble after a few seconds, once per visit, if the chat was never opened
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem('dentalflow-teaser') === '1'; } catch { /* ignore */ }
    if (seen) return;
    const id = setTimeout(() => setTeaser(true), 6000);
    return () => clearTimeout(id);
  }, []);
  const hideTeaser = () => {
    setTeaser(false);
    try { sessionStorage.setItem('dentalflow-teaser', '1'); } catch { /* ignore */ }
  };

  // keep the newest message in view
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [msgs, busy, open, reduce]);

  // recordings waiting to be sent again after a failure (kept in memory only)
  const retryAudio = useRef(new Map<string, Extra>());
  const send = useCallback(async (text: string, shown?: string, extra: Extra = {}) => {
    const message = text.trim().slice(0, 1000);
    const attempt = { ...extra, idempotencyKey: extra.idempotencyKey || crypto.randomUUID() };
    if ((!message && !extra.audio) || busy) return;
    const before = msgsRef.current.filter(m => !m.error);
    const mine: Msg = extra.voice
      ? { id: uid(), role: 'user', text: t.voiceNote, voice: extra.voice }
      : { id: uid(), role: 'user', text: shown?.trim() || message, sent: shown?.trim() && shown.trim() !== message ? message : undefined, request: extra.request };
    setMsgs([...before, mine]);
    setDraft('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.idempotencyKey },
        body: JSON.stringify({ sessionId: session.current, message, history: toHistory(before), lang, demoState: demoState.current, ...(extra.audio ? { audio: extra.audio } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as (ChatResponse & { error?: string; detail?: string }) | null;
      if (!res.ok || !data || (!data.reply && !data.carousel && !data.booking)) throw Object.assign(new Error(data?.error || String(res.status)), { detail: data?.detail });
      if (data.demo) demoState.current = data.demoState ?? null;
      if (extra.voice && data.heard) setMsgs(m => m.map(x => (x.id === mine.id ? { ...x, heard: data.heard } : x)));
      setMsgs(m => [...m, {
        id: uid(), role: 'assistant', text: data.reply, quickReplies: data.quickReplies ?? [], carousel: data.carousel,
        booking: data.booking, note: data.note || undefined, demo: !!data.demo,
      }]);
    } catch (e) {
      const detail = (e as { detail?: string })?.detail;
      const id = uid();
      retryAudio.current.set(id, attempt);
      setMsgs(m => [...m, { id, role: 'assistant', text: t.error, error: true, retry: message || ' ', detail }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    }
  }, [busy, lang, t.error, t.voiceNote]);

  // the booking panel
  const [panel, setPanel] = useState<PanelStart | null>(null);
  const confirmBooking = (r: BookingRequest) => {
    setPanel(null);
    void send(requestMessage(r), t.bookingRequest, { request: r });
  };

  // "View My Appointments" / "Cancel an Appointment": handled here, never by the assistant
  const [lookup, setLookup] = useState<'view' | 'cancel' | null>(null);
  const lastPurpose = useRef<'view' | 'cancel'>('view');
  const contact = useRef<{ key: string; value: Contact } | null>(null);
  const callAppointments = async (body: Record<string, unknown>): Promise<AppointmentsAnswer & { status?: number }> => {
    try {
      const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, lang }) });
      const data = (await res.json().catch(() => null)) as AppointmentsAnswer | null;
      if (res.status === 429) return { ok: false, reason: 'too-many', status: 429 };
      if (!data) return { ok: false, reason: 'failed', status: res.status };
      return { ...data, status: res.status };
    } catch { return { ok: false, reason: 'failed' }; }
  };
  const say = (text: string, quickReplies: QuickReply[] = [], extra: Partial<Msg> = {}) =>
    setMsgs(m => [...m, { id: uid(), role: 'assistant', text, quickReplies, demo: serverDemoRef.current === true, ...extra }]);
  const qr = (...titles: string[]) => titles.map(x => ({ title: x, value: x }));
  const phoneText = `\u2066${phone}\u2069`;

  const showAppointments = async (purpose: 'view' | 'cancel', value: Contact) => {
    setBusy(true);
    const r = await callAppointments({ action: 'list', contact: value });
    setBusy(false);
    if (!r.ok) {
      say(r.reason === 'too-many' ? fill(t.tooMany, { phone: phoneText }) : r.reason === 'invalid-contact' ? t.badContact : t.lookupError,
        r.reason === 'too-many' ? [] : qr(t.tryAnother, t.starters[0]), { error: r.reason !== 'invalid-contact' && r.reason !== 'too-many' });
      if (r.reason === 'invalid-contact') setLookup(purpose);
      return;
    }
    if (!('appointments' in r)) return;
    const key = uid();
    contact.current = { key, value };
    if (!r.appointments.length) { say(t.noneFound, qr(t.starters[0], t.tryAnother)); return; }
    say(purpose === 'cancel' ? t.foundCancel : t.foundView, purpose === 'view' ? qr(t.starters[0]) : [], { appts: { purpose, items: r.appointments, key } });
  };
  const startLookup = (purpose: 'view' | 'cancel', shown: string) => {
    lastPurpose.current = purpose;
    setMsgs(m => [...m.filter(x => !x.error), { id: uid(), role: 'user', text: shown }]);
    // the same visit already looked up a number or email: use it again
    if (contact.current) { void showAppointments(purpose, contact.current.value); return; }
    setLookup(purpose);
    say(purpose === 'cancel' ? t.askContactCancel : t.askContactView, qr(t.neverMind));
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  };
  const submitContact = (text: string) => {
    const typed = text.trim().slice(0, 200);
    if (!typed || busy || !lookup) return;
    setDraft('');
    setMsgs(m => [...m, { id: uid(), role: 'user', text: typed }]);
    const value = readContact(typed);
    if (!value) { say(t.badContact, qr(t.neverMind)); return; }
    const purpose = lookup;
    setLookup(null);
    void showAppointments(purpose, value);
  };
  const cancelAppointment = async (key: string, reference: string): Promise<boolean> => {
    if (!contact.current || contact.current.key !== key) { say(t.lookAgain, qr(t.starters[2])); return false; }
    const r = await callAppointments({ action: 'cancel', contact: contact.current.value, reference });
    const mark = () => setMsgs(m => m.map(x => (x.appts?.key === key
      ? { ...x, appts: { ...x.appts, items: x.appts.items.map(a => (a.reference === reference ? { ...a, status: 'cancelled' as const } : a)) } } : x)));
    if (r.ok && 'cancelled' in r) {
      mark();
      say(`${fill(t.cancelledMsg, { ref: reference })}${r.emailed ? `\n${t.cancelledEmailed}` : ''}`, qr(t.starters[0]));
      return true;
    }
    const reason = r.ok ? 'failed' : r.reason;
    if (reason === 'already-cancelled') { mark(); say(t.alreadyCancelled, qr(t.starters[0])); return true; }
    say(reason === 'too-many' ? fill(t.tooMany, { phone: phoneText })
      : reason === 'past' ? fill(t.pastAppt, { phone: phoneText })
      : reason === 'too-late' ? fill(t.tooLate, { phone: phoneText })
      : reason === 'not-found' ? t.lookAgain
      : fill(t.cancelFailed, { phone: phoneText }));
    return false;
  };

  // voice messages
  const voice = useVoice(
    d => void send('', undefined, { audio: { mime: 'audio/wav', data: d.base64 }, voice: { seconds: d.seconds, url: d.url } }),
    { denied: t.voiceDenied, unsupported: t.voiceUnsupported, short: t.voiceShort, failed: t.voiceFailed },
  );

  // other buttons on the page open the chat (and may send a first message)
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<OpenChatDetail>).detail;
      hideTeaser();
      setOpen(true);
      if (d?.message) pending.current = d.message;
      else if (d?.book) setPanel(d.book);
    };
    window.addEventListener(OPEN_CHAT_EVENT, on);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, on);
  }, []);
  useEffect(() => {
    if (open && pending.current && !busy) {
      const m = pending.current;
      pending.current = null;
      void send(m);
    }
  }, [open, busy, send]);

  // focus the text box on open; Escape closes and returns focus to the button
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => input.current?.focus({ preventScroll: true }), 250);
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); launcher.current?.focus(); } };
    window.addEventListener('keydown', esc);
    return () => { clearTimeout(id); window.removeEventListener('keydown', esc); };
  }, [open]);

  // lock the page behind the full-screen chat on phones
  useEffect(() => {
    if (!open || window.matchMedia('(min-width: 640px)').matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const restart = () => {
    setPanel(null);
    setLookup(null);
    contact.current = null;
    session.current = uid();
    demoState.current = null;
    setMsgs([]);
    setDraft('');
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (lookup) submitContact(draft); else void send(draft); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (lookup) submitContact(draft); else void send(draft); }
  };
  // grow the text box with its content, up to five lines
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [draft]);

  const last = msgs[msgs.length - 1];
  // the Demo label shows only while the site really is in demo mode
  const isDemo = serverDemo ?? !!msgs.filter(m => m.role === 'assistant' && !m.error).pop()?.demo;
  // the menu buttons (the welcome's, or the same ones from the assistant) work here, without a message:
  // Book opens the booking panel; View and Cancel ask for the number or email; "Never mind" leaves that
  const pick = (value: string, title: string) => {
    const a = actionOf(title);
    if (a !== 'never') setLookup(null);
    if (a === 'book') setPanel({});
    else if (a === 'view' || a === 'cancel') startLookup(a, title);
    else if (a === 'another') { contact.current = null; startLookup(lastPurpose.current, title); }
    else if (a === 'never') {
      setLookup(null);
      setMsgs(m => [...m, { id: uid(), role: 'user', text: title }]);
      say(t.neverMindReply, qr(...t.starters));
    }
    else void send(value, title);
  };
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <>
      {/* launcher */}
      <div className="fixed end-4 bottom-4 z-50 flex items-end gap-3 sm:end-6 sm:bottom-6">
        <AnimatePresence>
          {teaser && !open && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.97 }}
              className="glass-strong relative mb-2 hidden max-w-[15rem] rounded-2xl rounded-ee-md p-3.5 pe-8 text-sm text-ink sm:block"
            >
              <button type="button" onClick={() => { hideTeaser(); setOpen(true); }} className="text-start">{t.welcome}</button>
              <button type="button" onClick={hideTeaser} aria-label={t.close} className="absolute end-2 top-2 grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-mist">
                <svg viewBox="0 0 20 20" className="h-3 w-3" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          ref={launcher}
          type="button"
          onClick={() => { hideTeaser(); setOpen(o => !o); }}
          aria-label={open ? t.close : t.open}
          aria-expanded={open}
          aria-controls="dentalflow-chat"
          whileHover={reduce ? undefined : { scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className={`relative grid h-15 w-15 place-items-center rounded-full bg-linear-to-br from-brand to-accent text-white shadow-[0_18px_40px_-12px_rgb(14_116_144/0.7)] ${open ? 'max-sm:hidden' : ''}`}
        >
          {!open && !reduce && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30 [animation-duration:2.8s]" aria-hidden="true" />}
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.svg key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </motion.svg>
            ) : (
              <motion.svg key="c" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} viewBox="0 0 24 24" className="h-6.5 w-6.5" aria-hidden="true">
                <path fill="currentColor" d="M12 3c5 0 9 3.6 9 8s-4 8-9 8c-1 0-2-.1-2.9-.4L4.5 20.4c-.6.3-1.2-.3-1-.9l1.2-3.6C3.6 14.6 3 12.9 3 11c0-4.4 4-8 9-8zm-4 7.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm4 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm4 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z" />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* window */}
      <AnimatePresence>
        {open && (
          <motion.section
            id="dentalflow-chat"
            role="dialog"
            aria-modal="false"
            aria-label={t.title}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            style={{ transformOrigin: lang === 'en' ? 'bottom right' : 'bottom left' }}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-mist sm:inset-auto sm:end-6 sm:bottom-24 sm:h-[min(680px,calc(100svh-8rem))] sm:w-[400px] sm:rounded-[1.75rem] sm:shadow-[0_40px_100px_-30px_rgb(11_27_43/0.45)] sm:ring-1 sm:ring-black/5"
          >
            {/* header */}
            <header className="relative flex shrink-0 items-center gap-3 bg-linear-to-br from-brand-deep via-brand to-accent px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-4 text-white">
              <span className="relative grid h-10 w-10 place-items-center rounded-full bg-white/15 ring-1 ring-white/25">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="currentColor" d="M12 3.2c-2-1.3-6.4-1.3-7.7 1.6-1.3 2.9.2 6.4 1.1 8.6.9 2.4.7 6.6 2.4 8.4 1.3 1.3 2.2-.7 2.4-2.6.2-1.8.7-3.7 1.8-3.7s1.6 1.9 1.8 3.7c.2 1.9 1.1 3.9 2.4 2.6 1.7-1.8 1.5-6 2.4-8.4.9-2.2 2.4-5.7 1.1-8.6C18.4 1.9 14 1.9 12 3.2z" /></svg>
                <span className="absolute -end-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-brand" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 text-[15px] leading-tight font-semibold">
                  {t.title}
                  {isDemo && <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-950">{t.demoBadge}</span>}
                </h2>
                <p className="text-xs text-white/75">{busy ? t.typing : t.status}</p>
              </div>
              {msgs.length > 0 && (
                <button type="button" onClick={restart} title={t.restart} aria-label={t.restart} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15">
                  <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.3M4 4v3.5h3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
              <button type="button" onClick={() => { setOpen(false); launcher.current?.focus(); }} aria-label={t.close} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15">
                <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" aria-hidden="true"><path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </header>

            {/* Keep overlays below the header, including safe-area and translated text height. */}
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* messages */}
              <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-5" aria-live="polite" aria-relevant="additions">
                <Bubble role="assistant">{t.welcome}</Bubble>
                {msgs.length === 0 && (
                  <QuickReplies items={t.starters.map(s => ({ title: s, value: s }))} onPick={pick} disabled={busy} />
                )}

              {msgs.map(m => (
                <div key={m.id} className="space-y-2.5">
                  {(m.text || m.role === 'user') && (
                    m.request ? <RequestCard r={m.request} t={t} lang={lang} /> :
                    m.voice ? <VoiceBubble m={m} t={t} mmss={mmss} /> :
                    <Bubble role={m.role} error={m.error}>
                      {m.role === 'assistant' ? <RichText text={m.text} /> : m.text}
                    </Bubble>
                  )}
                  {m.error && m.detail && (
                    <p className="ms-10 rounded-xl bg-amber-50 px-3 py-2 font-mono text-[11px] leading-snug text-amber-900 ring-1 ring-amber-200" dir="ltr">
                      For you (only shown on your computer): {m.detail}
                    </p>
                  )}
                  {m.error && m.retry && m === last && (
                    <div className="ps-10">
                      <button type="button" onClick={() => { const x = retryAudio.current.get(m.id); void send(m.retry!.trim(), x?.request ? t.bookingRequest : undefined, x ?? {}); }} disabled={busy} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/30 hover:bg-sky">
                        {t.retry}
                      </button>
                    </div>
                  )}
                  {m.carousel && <CarouselView data={m.carousel} onPick={pick} disabled={busy || m !== last} hint={t.scrollHint} />}
                  {m.appts && m.appts.items.length > 0 && (
                    <AppointmentCards items={m.appts.items} purpose={m.appts.purpose} lang={lang} t={t}
                      canCancel={contact.current?.key === m.appts.key} onCancel={ref => cancelAppointment(m.appts!.key, ref)} />
                  )}
                  {m.quickReplies && m.quickReplies.length > 0 && m === last && <QuickReplies items={m.quickReplies} onPick={pick} disabled={busy} />}
                  {m.booking && <BookingCard b={m.booking} t={t} demo={m.demo} />}
                </div>
              ))}
              <AnimatePresence>{busy && <Typing label={t.typing} />}</AnimatePresence>
              {isDemo && <p className="pt-1 text-center text-[11px] text-amber-700">{t.demo}</p>}
            </div>

            {/* input */}
            <form onSubmit={onSubmit} className="border-t border-line/70 bg-white/90 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
              {voice.error && (
                <p className="mb-2 flex items-start justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                  {voice.error}
                  <button type="button" onClick={() => voice.setError('')} aria-label={t.close} className="shrink-0 font-bold">×</button>
                </p>
              )}
              {voice.status !== 'idle' ? (
                <div className="flex items-center gap-2 rounded-2xl bg-mist p-1.5 ring-2 ring-rose-300/70" role="status">
                  <button type="button" onClick={voice.cancel} disabled={voice.status === 'processing'} aria-label={t.voiceCancel}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-white disabled:opacity-40">
                    <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2m-6 0 .7 10h6.6L14 6" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink" dir="ltr">{mmss(voice.seconds)}</span>
                  <span className="flex h-8 flex-1 items-center justify-center gap-[3px] overflow-hidden" aria-hidden="true">
                    {Array.from({ length: 18 }, (_, i) => (
                      <span key={i} className="w-[3px] rounded-full bg-brand/70 transition-[height] duration-100"
                        style={{ height: `${Math.max(12, Math.min(100, voice.level * 100 * (0.55 + 0.45 * Math.sin(i * 1.7 + voice.seconds))))}%` }} />
                    ))}
                  </span>
                  <span className="hidden text-[11px] text-muted sm:inline">{voice.status === 'processing' ? '…' : `${t.voiceRecording} (${MAX_SECONDS}s)`}</span>
                  <button type="button" onClick={voice.send} disabled={voice.status === 'processing'} aria-label={t.voiceStop}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-white disabled:opacity-50">
                    <svg viewBox="0 0 20 20" className="h-4.5 w-4.5 rtl:-scale-x-100" aria-hidden="true"><path d="M3.5 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              ) : (
              <div className="flex items-end gap-2 rounded-2xl bg-mist p-1.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand/40">
                <label htmlFor="dentalflow-chat-input" className="sr-only">{t.placeholder}</label>
                <textarea
                  id="dentalflow-chat-input"
                  ref={input}
                  rows={1}
                  value={draft}
                  maxLength={1000}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={onKey}
                  placeholder={lookup ? t.contactPlaceholder : t.placeholder}
                  dir="auto"
                  className="max-h-[120px] min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-muted focus-visible:outline-none"
                />
                {draft.trim() ? (
                  <motion.button type="submit" disabled={busy} whileTap={{ scale: 0.9 }} aria-label={t.send}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-white transition disabled:bg-line disabled:text-muted">
                    <svg viewBox="0 0 20 20" className="h-4.5 w-4.5 rtl:-scale-x-100" aria-hidden="true"><path d="M3.5 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </motion.button>
                ) : (
                    <motion.button type="button" onClick={() => void voice.start()} disabled={busy} whileTap={{ scale: 0.9 }} aria-label={t.voiceStart} title={t.voiceStart}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand to-accent text-white transition disabled:opacity-40">
                      <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" fill="currentColor" /><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" /></svg>
                    </motion.button>
                )}
              </div>
              )}
                <p className="mt-2 px-1 text-center text-[10.5px] leading-snug text-muted">
                  {fill(t.privacy, { phone: `\u2066${phone}\u2069` })} · {t.poweredBy}
                </p>
              </form>
              <AnimatePresence>
                {panel && <BookingPanel lang={lang} t={t} minWord={minWord} start={panel} onClose={() => setPanel(null)} onConfirm={confirmBooking} />}
              </AnimatePresence>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function Bubble({ role, children, error }: { role: 'user' | 'assistant'; children: React.ReactNode; error?: boolean }) {
  if (role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex justify-end">
        <p dir="auto" className="max-w-[82%] rounded-2xl rounded-ee-md bg-linear-to-br from-brand to-brand-deep px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-white shadow-sm">
          {children}
        </p>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2">
      <Avatar />
      <p dir="auto" className={`max-w-[82%] rounded-2xl rounded-es-md px-4 py-2.5 text-[14.5px] leading-relaxed shadow-sm ring-1 ${error ? 'bg-rose-50 text-rose-900 ring-rose-200' : 'bg-white text-ink ring-line/70'}`}>
        {children}
      </p>
    </motion.div>
  );
}

function RequestCard({ r, t, lang }: { r: BookingRequest; t: Dict['chat']; lang: Lang }) {
  const rows: [string, string][] = [
    [t.treatmentLabel, r.serviceName],
    [t.when, `${dayTitle(lang, r.date, true)} · ${clock(lang, r.time)}`],
    ...(r.dentistName ? [[t.with, r.dentistName] as [string, string]] : []),
    [t.patientLabel, r.name],
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
      <div className="w-[82%] overflow-hidden rounded-2xl rounded-ee-md bg-linear-to-br from-brand to-brand-deep text-white shadow-sm">
        <p className="border-b border-white/15 px-4 py-2 text-[11px] font-semibold tracking-wide uppercase opacity-80">{t.bookingRequest}</p>
        <dl className="space-y-1 px-4 py-2.5 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="opacity-70">{k}</dt><dd className="text-end font-semibold">{v}</dd></div>
          ))}
        </dl>
      </div>
    </motion.div>
  );
}

function VoiceBubble({ m, t, mmss }: { m: Msg; t: Dict['chat']; mmss: (s: number) => string }) {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const toggle = () => {
    if (!m.voice?.url) return;
    if (!audio.current) { audio.current = new Audio(m.voice.url); audio.current.onended = () => setPlaying(false); }
    if (playing) { audio.current.pause(); setPlaying(false); } else { void audio.current.play(); setPlaying(true); }
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex flex-col items-end gap-1">
      <div className="flex max-w-[82%] items-center gap-2.5 rounded-2xl rounded-ee-md bg-linear-to-br from-brand to-brand-deep px-3 py-2.5 text-white shadow-sm">
        <button type="button" onClick={toggle} disabled={!m.voice?.url} aria-label={t.voiceNote}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/20 disabled:opacity-60">
          {playing
            ? <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg>
            : <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
        </button>
        <span className="flex items-center gap-[3px]" aria-hidden="true">
          {[5, 9, 14, 8, 12, 6, 10, 15, 7, 11, 5, 9].map((h, i) => <span key={i} className="w-[3px] rounded-full bg-white/70" style={{ height: h }} />)}
        </span>
        <span className="text-xs tabular-nums opacity-90" dir="ltr">{mmss(m.voice?.seconds ?? 0)}</span>
      </div>
      {m.heard && <p dir="auto" className="max-w-[82%] px-1 text-end text-[12px] leading-snug text-muted italic">“{m.heard}”</p>}
    </motion.div>
  );
}
