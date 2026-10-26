/** What the browser and the site's /api/chat route send each other. Same shape as workflow 17 answers with. */

export type QuickReply = { title: string; value: string };
export type CarouselItem = { title: string; subtitle?: string; value: string };
export type Carousel = { label: string; items: CarouselItem[] };
export type Booking = {
  reference: string; when: string; service: string; dentist: string;
  whatsappSent: boolean; emailCopy: boolean;
};

export type ChatResponse = {
  ok: boolean;
  reply: string;
  quickReplies: QuickReply[];
  carousel: Carousel | null;
  booking: Booking | null;
  /** exact dates behind the times offered: kept and sent back with the chat, never shown */
  note: string;
  lang: string;
  /** for a voice message: the words that were heard */
  heard?: string;
  /** demo mode only */
  demo?: boolean;
  demoState?: DemoState | null;
};

export type HistoryItem = { role: 'user' | 'assistant' | 'note'; text: string };

export type ChatRequest = {
  sessionId: string;
  message: string;
  history: HistoryItem[];
  lang: string;
  demoState?: DemoState | null;
  /** a voice message: a short WAV recording as base64 (then message may be empty) */
  audio?: { mime: string; data: string } | null;
};

/** Where a demo conversation has got to (demo mode keeps no memory on the server). */
export type DemoState = { step: 'start' | 'treatment' | 'time' | 'details' | 'confirm'; service?: string; dentist?: string; slot?: string };

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\r/g, '').slice(0, n) : '');

/** Accepts the service response and keeps only the expected, size-limited fields. */
export function cleanResponse(raw: unknown): ChatResponse {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const r = (o.response && typeof o.response === 'object' ? o.response : o) as Record<string, unknown>;
  const qr = Array.isArray(r.quickReplies) ? r.quickReplies : [];
  const car = r.carousel && typeof r.carousel === 'object' ? (r.carousel as Record<string, unknown>) : null;
  const items = car && Array.isArray(car.items) ? car.items : [];
  const b = r.booking && typeof r.booking === 'object' ? (r.booking as Record<string, unknown>) : null;
  const quickReplies = qr.slice(0, 3).map(q => {
    const x = (q ?? {}) as Record<string, unknown>;
    return { title: str(x.title, 60), value: str(x.value ?? x.title, 300) };
  }).filter(q => q.title);
  const carouselItems = items.slice(0, 10).map(i => {
    const x = (i ?? {}) as Record<string, unknown>;
    return { title: str(x.title, 80), subtitle: str(x.subtitle, 120), value: str(x.value ?? x.title, 300) };
  }).filter(i => i.title);
  return {
    ok: r.ok !== false,
    reply: str(r.reply, 4000),
    quickReplies,
    carousel: carouselItems.length ? { label: str(car?.label, 80), items: carouselItems } : null,
    booking: b && str(b.reference, 40) ? {
      reference: str(b.reference, 40), when: str(b.when, 120), service: str(b.service, 120), dentist: str(b.dentist, 120),
      whatsappSent: false, emailCopy: b.emailCopy === true,
    } : null,
    note: str(r.note, 2000),
    lang: str(r.lang, 10) || 'en',
    heard: str(r.heard, 1000),
  };
}
