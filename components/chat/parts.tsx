'use client';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
/** The pieces of the chat window: formatted text, buttons, the scrolling cards, the typing dots and the booking card. */
import { Fragment, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Booking, Carousel as CarouselT, QuickReply } from '@/lib/chat-types';
import type { Dict } from '@/lib/i18n';

/* -------------------------------------------------------- formatted text */
const TOKEN = /(\*[^*\n]+\*|https:\/\/[^\s<>"')]+)/g;

/** Shows the assistant's text safely: line breaks, *bold* and https links. No HTML is ever inserted. */
export function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, li) => (
        <Fragment key={li}>
          {li > 0 && <br />}
          {line.split(TOKEN).map((part, i): ReactNode => {
            if (!part) return null;
            if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>;
            if (part.startsWith('https://')) {
              const href = part.replace(/[.,;:!?]+$/, '');
              return (
                <Fragment key={i}>
                  <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand">
                    {href.replace(/^https:\/\/(www\.)?/, '').slice(0, 40)}
                  </a>
                  {part.slice(href.length)}
                </Fragment>
              );
            }
            return <Fragment key={i}>{part}</Fragment>;
          })}
        </Fragment>
      ))}
    </>
  );
}

/* --------------------------------------------------------- quick replies */
export function QuickReplies({ items, onPick, disabled }: { items: QuickReply[]; onPick: (v: string, title: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 ps-10">
      {items.map((q, i) => (
        <motion.button
          key={q.title + i}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q.value, q.title)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.3 }}
          className="min-h-11 rounded-full border border-brand/25 bg-white px-3.5 py-2 text-[13px] font-semibold text-brand-deep shadow-sm transition hover:border-brand hover:bg-brand hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {q.title}
        </motion.button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- option list */
/** The assistant's choices (treatments, times, days…), one under another. Long lists show 6 first. */
export function Carousel({ data, onPick, disabled }: { data: CarouselT; onPick: (v: string, title: string) => void; disabled?: boolean; hint?: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? data.items : data.items.slice(0, 6);
  return (
    <div className="ps-10">
      {data.label && <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{data.label}</p>}
      <div className="space-y-1.5" role="list">
        {shown.map((it, i) => (
          <motion.button
            role="listitem"
            key={it.title + i}
            type="button"
            disabled={disabled}
            onClick={() => onPick(it.value, it.title)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i, duration: 0.25 }}
            className="group flex w-full items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 text-start ring-1 ring-line transition hover:ring-brand/60 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] leading-snug font-semibold text-ink">{it.title}</span>
              {it.subtitle && <span className="block text-xs leading-snug text-muted">{it.subtitle}</span>}
            </span>
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-brand rtl:-scale-x-100" aria-hidden="true">
              <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        ))}
      </div>
      {!all && data.items.length > 6 && (
        <button type="button" onClick={() => setAll(true)} disabled={disabled}
          className="mt-1.5 w-full rounded-xl py-2 text-xs font-semibold text-brand ring-1 ring-brand/25 hover:bg-sky disabled:opacity-50">
          + {data.items.length - 6}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- typing */
export function Typing({ label }: { label: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full rounded-2xl bg-white ring-1 ring-line/70">
      <LoadingIndicator label={label} />
    </motion.div>
  );
}

export function Avatar() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-brand to-accent text-white shadow-sm" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="currentColor" d="M12 3.2c-2-1.3-6.4-1.3-7.7 1.6-1.3 2.9.2 6.4 1.1 8.6.9 2.4.7 6.6 2.4 8.4 1.3 1.3 2.2-.7 2.4-2.6.2-1.8.7-3.7 1.8-3.7s1.6 1.9 1.8 3.7c.2 1.9 1.1 3.9 2.4 2.6 1.7-1.8 1.5-6 2.4-8.4.9-2.2 2.4-5.7 1.1-8.6C18.4 1.9 14 1.9 12 3.2z" /></svg>
    </span>
  );
}

/* --------------------------------------------------------- booking card */
export function BookingCard({ b, t, demo }: { b: Booking; t: Dict['chat']; demo?: boolean }) {
  const rows: [string, string][] = [[t.when, b.when], [t.with, b.dentist]].filter(([, v]) => v) as [string, string][];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="ms-10 overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-ok/25"
    >
      <div className="flex items-center gap-3 bg-linear-to-r from-ok/12 to-sky px-4 py-3">
        <motion.span
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 15 }}
          className="grid h-8 w-8 place-items-center rounded-full bg-ok text-white"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
            <motion.path d="M5 10.5l3 3 7-7" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.4 }} />
          </svg>
        </motion.span>
        <div>
          <p className="text-sm font-semibold text-ink">{t.booked}</p>
          {b.service && <p className="text-xs text-ink-soft">{b.service}</p>}
        </div>
      </div>
      <dl className="space-y-1.5 px-4 py-3 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted">{k}</dt><dd className="text-end font-medium text-ink">{v}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t.reference}</dt>
          <dd className="font-mono text-xs font-semibold tracking-wider text-brand-deep" dir="ltr">{b.reference}</dd>
        </div>
      </dl>
      <p className="border-t border-line/70 px-4 py-2.5 text-xs text-ink-soft">
        {b.emailCopy ? t.sentEmail : t.emailFailed}
        {demo && <span className="ms-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{t.demoBadge}</span>}
      </p>
    </motion.div>
  );
}
