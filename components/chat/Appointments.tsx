'use client';
/**
 * "View My Appointments" / "Cancel an Appointment": the visitor's upcoming
 * appointments as cards inside the chat. In cancel mode (or from a viewed
 * card) "Cancel" asks "Are you sure?" on the card itself before anything is
 * sent; only "Yes, cancel" calls the clinic.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useClinic } from '@/components/ClinicProvider';
import type { Appointment } from '@/lib/appointments';
import { LOCALE } from '@/lib/format';
import type { Dict, Lang } from '@/lib/i18n';
import { clock, dayTitle } from '@/lib/slots';

/** the sheet keeps English treatment names: show the visitor's language when we know the treatment */
export function AppointmentCards({ items, purpose, lang, t, canCancel, onCancel, onReschedule }: {
  items: Appointment[];
  purpose: 'view' | 'cancel';
  lang: Lang;
  t: Dict['chat'];
  /** false once the chat was reloaded: the number or email is not kept, so it must be looked up again */
  canCancel: boolean;
  onCancel: (reference: string) => Promise<boolean>;
  onReschedule?: (appointment:Appointment)=>void;
}) {
  return (
    <motion.ul initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ms-10 space-y-2.5" aria-label={t.yourAppointments}>
      {items.map((a, i) => (
        <motion.li key={a.reference} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }}>
          <Card a={a} lang={lang} t={t} showCancel={canCancel && a.status !== 'cancelled'} prominent={purpose === 'cancel'} onCancel={onCancel} onReschedule={onReschedule} />
        </motion.li>
      ))}
    </motion.ul>
  );
}

function Card({ a, lang, t, showCancel, prominent, onCancel, onReschedule }: {
  a: Appointment; lang: Lang; t: Dict['chat']; showCancel: boolean; prominent: boolean; onReschedule?:(appointment:Appointment)=>void; onCancel: (reference: string) => Promise<boolean>;
}) {
  const { services } = useClinic();
  const localService = (name: string, lang: Lang) => services.find(s => s.name.en.toLowerCase() === name.trim().toLowerCase())?.name[lang] ?? name;
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const gone = a.status === 'cancelled';
  const d = new Date(a.date + 'T12:00:00Z');
  const month = d.toLocaleDateString(LOCALE[lang], { timeZone: 'UTC', month: 'short' });
  const day = d.toLocaleDateString(LOCALE[lang], { timeZone: 'UTC', day: 'numeric' });
  const yes = async () => {
    setStep('busy');
    const ok = await onCancel(a.reference);
    setStep(ok ? 'idle' : 'confirm');
  };

  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition ${gone ? 'opacity-70 ring-line' : step !== 'idle' ? 'ring-rose-200' : 'ring-line/80'}`}>
      <div className="flex gap-3 p-3">
        <div className={`grid w-12 shrink-0 place-items-center rounded-xl py-1.5 text-center ${gone ? 'bg-mist text-muted' : 'bg-sky text-brand-deep'}`} aria-hidden="true">
          <span className="text-[10px] font-semibold tracking-wide uppercase">{month}</span>
          <span className="text-lg leading-none font-bold">{day}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-[14px] leading-snug font-semibold text-ink ${gone ? 'line-through decoration-ink/40' : ''}`}>{localService(a.service, lang)}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
              gone ? 'bg-rose-50 text-rose-700' : a.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
              {gone ? t.cancelledLabel : a.status === 'pending' ? t.statusPending : t.statusConfirmed}
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-soft">{dayTitle(lang, a.date)} · <span dir="ltr">{clock(lang, a.time)}</span></p>
          <div className="mt-1 flex items-center justify-between gap-2 text-[12px]">
            {a.dentist ? <span className="truncate text-muted">{a.dentist}</span> : <span />}
            <span className="font-mono text-[11px] font-semibold tracking-wider text-brand-deep/80" dir="ltr">{a.reference}</span>
          </div>
        </div>
      </div>

      {showCancel && !gone && onReschedule && <button type="button" className="min-h-11 w-full border-t border-line px-3 py-2 text-sm font-semibold text-brand" onClick={()=>onReschedule(a)}>{lang==='ur'?'وقت تبدیل کریں':'Change appointment time'}</button>}
      {showCancel && !gone && (
        <AnimatePresence mode="wait" initial={false}>
          {step === 'idle' ? (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-t border-line/70 px-3 py-2">
              <button type="button" onClick={() => setStep('confirm')}
                className={`w-full rounded-xl py-2 text-[13px] font-semibold transition ${prominent ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100' : 'text-rose-700 hover:bg-rose-50'}`}>
                {t.apptCancel}
              </button>
            </motion.div>
          ) : (
            <motion.div key="confirm" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="border-t border-rose-100 bg-rose-50/60 px-3 py-2.5" role="alertdialog" aria-label={t.confirmCancel}>
              <p className="mb-2 text-[13px] font-semibold text-rose-900">{t.confirmCancel}</p>
              <div className="flex gap-2">
                <button type="button" onClick={yes} disabled={step === 'busy'}
                  className="flex-1 rounded-xl bg-rose-600 py-2 text-[13px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60">
                  {step === 'busy' ? '…' : t.yesCancel}
                </button>
                <button type="button" onClick={() => setStep('idle')} disabled={step === 'busy'}
                  className="flex-1 rounded-xl bg-white py-2 text-[13px] font-semibold text-ink ring-1 ring-line transition hover:bg-mist disabled:opacity-60">
                  {t.keepIt}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
