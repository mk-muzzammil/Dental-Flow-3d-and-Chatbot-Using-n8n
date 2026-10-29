/** The sections after the 3D opening (rendered on the server; only the small animated parts run in the browser). */
import { tooth3d } from '@/content/clinic';
import { publicClinic } from '@/lib/server/storage/public-clinic';
import { fill, type Dict, type Lang } from '@/lib/i18n';
import { clock, weekdayLabel } from '@/lib/slots';
import { minutes, money } from '@/lib/format';
import { Arrow, LogoMark, OpenChatButton, Reveal } from './ui';

/** Section heading: a numbered eyebrow and a serif title. */
function Head({ n, eyebrow, title, aside }: { n: string; eyebrow: string; title: string; aside?: React.ReactNode }) {
  return (
    <Reveal className="grid gap-6 border-t border-line pt-8 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        <p className="eyebrow mb-4 flex items-center gap-3"><span className="num text-base text-brand">{n}</span><span className="h-px w-8 bg-brand/40" />{eyebrow}</p>
        <h2 className="font-display max-w-2xl text-balance text-4xl leading-[1.04] text-ink sm:text-5xl md:text-6xl">{title}</h2>
      </div>
      {aside}
    </Reveal>
  );
}

export async function Treatments({ lang, t }: { lang: Lang; t: Dict }) {
  const { clinic, services } = await publicClinic();
  return (
    <section id="treatments" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:py-32">
      <Head n="01" eyebrow={t.treatments.eyebrow} title={t.treatments.title}
        aside={<p className="max-w-xs text-sm leading-relaxed text-muted">{t.treatments.note}</p>} />
      <ul className="mt-12 divide-y divide-line border-y border-line">
        {services.map((s, i) => (
          <Reveal as="li" key={s.id} delay={(i % 3) * 0.05}>
            <div className="group grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 py-7 sm:grid-cols-[3rem_1.2fr_1fr_auto_auto] sm:gap-x-8">
              <span className="num text-xl text-muted">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="font-display text-2xl text-ink sm:text-3xl">{s.name[lang]}</h3>
              <p className="col-span-2 text-sm leading-relaxed text-ink-soft sm:col-span-1">{s.blurb[lang]}</p>
              <p className="col-span-2 flex items-baseline gap-3 text-sm sm:col-span-1 sm:block sm:text-end">
                <span className="font-semibold text-ink tabular-nums">{money(lang, s.price, clinic.currency)}</span>
                <span className="block text-muted">{minutes(lang, s.minutes, t.treatments.min)}</span>
              </p>
              <div className="col-span-2 sm:col-span-1">
                <OpenChatButton variant="ghost" book={{ service: s.id }} className="px-4! py-2.5! text-xs! group-hover:bg-ink! group-hover:text-white!">
                  {t.treatments.book}<Arrow className="h-3.5 w-3.5" />
                </OpenChatButton>
              </div>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export async function Dentists({ lang, t }: { lang: Lang; t: Dict }) {
  const { dentists } = await publicClinic();
  return (
    <section id="dentists" className="scroll-mt-24 bg-mist py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Head n="02" eyebrow={t.dentists.eyebrow} title={t.dentists.title} />
        <ul className={`mt-12 grid gap-5 ${dentists.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          {dentists.map((d, i) => (
            <Reveal as="li" key={d.id} delay={i * 0.08}>
              <article className="flex h-full flex-col rounded-[1.75rem] bg-white p-7 ring-1 ring-line">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-[1.7rem] leading-tight text-ink sm:text-3xl" dir="ltr">{d.name}</h3>
                    <p className="mt-1 text-sm text-brand">{d.specialty[lang]}</p>
                  </div>
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-linear-to-br from-brand-deep to-brand font-display text-xl text-white" aria-hidden="true">{d.initials}</span>
                </div>
                <dl className="mt-8 flex-1 border-t border-line pt-5 text-sm">
                  <dt className="eyebrow text-muted!">{t.dentists.days}</dt>
                  <dd className="mt-1.5 text-ink">{d.days[lang]}</dd>
                  {d.weeklyHours?.length ? <>
                    <dt className="mt-4 font-semibold">{t.dentists.hours}</dt>
                    <dd className="mt-2 space-y-2">
                      {d.weeklyHours.map(h => <div key={h.day} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                        <span>{weekdayLabel(lang, h.day)}</span>
                        <span dir="ltr" className="tabular-nums">{clock(lang,h.open)} – {clock(lang,h.close)}</span>
                        {h.breaks?.map(([from,to],i)=><small key={i} className="w-full text-muted">{t.dentists.break}: <bdi>{clock(lang,from)} – {clock(lang,to)}</bdi></small>)}
                      </div>)}
                    </dd>
                  </> : null}
                </dl>
                <OpenChatButton variant="ghost" book={{ dentist: d.id }} className="mt-6 w-full justify-between">
                  {fill(t.dentists.book, { name: d.name })}<Arrow />
                </OpenChatButton>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function How({ t }: { t: Dict }) {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:py-32">
      <Head n="03" eyebrow={t.how.eyebrow} title={t.how.title} aside={<OpenChatButton className="px-6! py-3.5!">{t.how.cta}<Arrow /></OpenChatButton>} />
      <ol className="mt-12 grid gap-px overflow-hidden rounded-[1.75rem] bg-line ring-1 ring-line md:grid-cols-3">
        {t.how.steps.map((s, i) => (
          <Reveal as="li" key={s.title} delay={i * 0.08} className="bg-white p-8">
            <span className="num block text-6xl leading-none text-brand/25">{i + 1}</span>
            <h3 className="mt-8 text-lg font-semibold text-ink">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export async function Visit({ lang, t }: { lang: Lang; t: Dict }) {
  const { clinic } = await publicClinic();
  return (
    <section id="visit" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-24 sm:pb-32">
      <Head n="04" eyebrow={t.visit.eyebrow} title={t.visit.title} />
      <div className="mt-12 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Reveal className="rounded-[1.75rem] bg-white p-7 ring-1 ring-line sm:p-9">
          <h3 className="eyebrow text-muted!">{t.visit.hours}</h3>
          <p className="mt-2 text-xs text-muted" dir="ltr">{clinic.timezone}</p>
          <dl className="mt-4 divide-y divide-line">
            {clinic.hours.map(h => (
              <div key={h.day.en} className="flex items-center justify-between gap-4 py-4">
                <dt className="text-ink">{h.day[lang]}</dt>
                <dd className={`text-sm tabular-nums ${h.time ? 'text-ink-soft' : 'text-muted'}`} dir="ltr">{(lang === 'ur' ? h.time.replace('break', 'وقفہ') : h.time) || t.visit.closed}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-7 flex flex-wrap gap-2">
            <a href={`tel:${clinic.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-deep">
              {t.visit.call} <span dir="ltr" className="font-normal opacity-75">{clinic.phone}</span>
            </a>

          </div>
        </Reveal>
        <Reveal delay={0.08} className="relative min-h-[340px] overflow-hidden rounded-[1.75rem] bg-brand-deep ring-1 ring-line">
          {/* a drawn map, so no third-party map loads until the visitor asks for it */}
          <svg className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs><pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#ffffff" strokeOpacity="0.07" /></pattern></defs>
            <rect width="400" height="320" fill="url(#grid)" />
            <path d="M-10 230 C 90 200, 160 250, 240 190 S 380 120, 420 140" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="12" fill="none" strokeLinecap="round" />
            <path d="M120 -10 C 140 80, 110 160, 170 330" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M260 -10 L 300 330" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="5" fill="none" />
          </svg>
          <div className="absolute start-1/2 top-[38%] -translate-x-1/2 rtl:translate-x-1/2">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/20" />
            <LogoMark className="relative h-12 w-12" />
          </div>
          <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-white/95 p-5 backdrop-blur">
            <p className="eyebrow text-muted!">{t.visit.address}</p>
            <p className="font-display mt-1 text-2xl text-ink">{clinic.address[lang]}</p>
            <a href={clinic.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-deep">
              {t.visit.map} <Arrow className="h-3.5 w-3.5" />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export async function Faq({ lang, t }: { lang: Lang; t: Dict }) {
  const { faq } = await publicClinic();
  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-24 sm:pb-32">
      <div className="grid gap-12 md:grid-cols-[1fr_1.4fr]">
        <Head n="05" eyebrow={t.faq.eyebrow} title={t.faq.title} />
        <div className="divide-y divide-line border-y border-line md:mt-8">
          {faq.map((f, i) => (
            <Reveal key={f.q.en} delay={i * 0.04}>
              <details className="group py-1 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] text-ink">
                  {f.q[lang]}
                  <span className="relative h-4 w-4 shrink-0 text-brand" aria-hidden="true">
                    <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
                    <span className="absolute inset-y-0 left-1/2 w-px bg-current transition-transform duration-300 group-open:scale-y-0" />
                  </span>
                </summary>
                <p className="pb-6 text-ink-soft">{f.a[lang]}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CallToAction({ t }: { t: Dict }) {
  return (
    <section className="px-3 pb-3 sm:px-5 sm:pb-5">
      <Reveal className="relative mx-auto max-w-[90rem] overflow-hidden rounded-[2rem] bg-brand-deep px-6 py-20 text-white sm:px-12 sm:py-28">
        <div className="pointer-events-none absolute -end-24 -top-40 h-[28rem] w-[28rem] rounded-full bg-accent/30 blur-3xl" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h2 className="font-display text-balance text-5xl leading-[1.02] sm:text-7xl">{t.how.title}</h2>
          <p className="mx-auto mt-6 max-w-xl text-white/70">{t.how.steps[2].body}</p>
          <div className="mt-10 flex justify-center">
            <OpenChatButton variant="ghost" className="bg-white! px-7! py-4! text-ink! ring-0!">{t.hero.cta}<Arrow /></OpenChatButton>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export async function Footer({ lang, t }: { lang: Lang; t: Dict }) {
  const { clinic } = await publicClinic();
  return (
    <footer>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-7 w-7" />
          <span className="font-display text-xl text-ink">{clinic.name[lang]}</span>
        </div>
        <p>© {new Date().getFullYear()} {clinic.name[lang]}. {t.footer.rights}</p>
        <p>{t.footer.powered}{tooth3d.credit ? <span className="block text-xs opacity-80">{tooth3d.credit}</span> : null}</p>
      </div>
    </footer>
  );
}
