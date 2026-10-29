'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PUBLIC_LANGS, langLabel, type Dict, type Lang } from '@/lib/i18n';
import { LogoMark, OpenChatButton } from './ui';

export function Nav({ lang, t, clinicName }: { lang: Lang; t: Dict; clinicName: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const links = [
    ['#treatments', t.nav.treatments],
    ['#dentists', t.nav.dentists],
    ['#how', t.nav.how],
    ['#visit', t.nav.visit],
    ['#faq', t.nav.faq],
  ] as const;

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5">
      <nav
        aria-label={t.nav.menu}
        className={`mx-auto flex max-w-6xl items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-500 ease-out-quart sm:px-4 ${
          scrolled || open ? 'glass-strong' : 'border border-transparent'
        }`}
      >
        <Link href={`/${lang}`} className="flex min-w-0 items-center gap-2.5 rounded-xl">
          <LogoMark className="h-9 w-9 shrink-0" />
          <span className="nav-clinic-name font-display min-w-0 truncate text-[21px] leading-none text-ink">{clinicName}</span>
        </Link>

        <ul className="ms-auto hidden items-center gap-1 lg:flex">
          {links.map(([href, label]) => (
            <li key={href}>
              <a href={href} className="rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-white/70 hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ms-auto flex shrink-0 items-center gap-2 lg:ms-2">
          <div className="hidden sm:block"><LangSwitch lang={lang} label={t.nav.language} /></div>
          <div className="hidden sm:block"><OpenChatButton className="px-4! py-2.5!">{t.nav.book}</OpenChatButton></div>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/70 ring-1 ring-line lg:hidden"
          >
            <span className="sr-only">{t.nav.menu}</span>
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
              {open
                ? <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                : <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
            className="glass-strong mx-auto mt-2 max-w-6xl rounded-2xl p-2 lg:hidden"
          >
            <ul>
              {links.map(([href, label]) => (
                <li key={href}>
                  <a href={href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 text-base font-medium text-ink hover:bg-sky">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="flex justify-center px-2 pt-2 sm:hidden"><LangSwitch lang={lang} label={t.nav.language} /></div>
            <div className="p-2" onClick={() => setOpen(false)}>
              <OpenChatButton className="w-full">{t.nav.book}</OpenChatButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function LangSwitch({ lang, label }: { lang: Lang; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex items-center rounded-full bg-white/70 p-1 ring-1 ring-line">
      {PUBLIC_LANGS.map(l => (
        <Link
          key={l}
          href={`/${l}`}
          hrefLang={l}
          lang={l}
          aria-current={l === lang ? 'page' : undefined}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold leading-5 transition-colors ${
            l === lang ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {l === 'en' ? 'EN' : langLabel[l]}
        </Link>
      ))}
    </div>
  );
}
