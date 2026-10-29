'use client';
/**
 * THE OPENING OF THE PAGE: the 3D mouth stays on screen while the visitor
 * scrolls through six panels (the welcome, then five treatments). Scroll
 * position becomes `stage` (0 to 5.6), which flies the camera to the part
 * of the mouth each panel talks about (see three/MouthScene.tsx).
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { fill, type Dict } from '@/lib/i18n';
import { MouthScene, ToothArt, useWebGL } from '../three/SceneLoader';
import { Arrow, OpenChatButton } from './ui';

const STAGES = 6;           // the welcome + five treatments
const TAIL = 0.6;           // a little extra scroll to finish the last animation
/** which bookable treatment each panel leads to (null: ask in the chat instead) */
const SERVICE: (string | null)[] = [null, 'checkup', 'filling', 'whiten', null, null];

export function Experience({ t, city, openingDays }: { t: Dict; city: string; openingDays: string }) {
  const host = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState({ viewport: 1, heights: Array<number>(STAGES).fill(1) });
  const reduce = !!useReducedMotion();

  useEffect(() => {
    const panels = host.current?.querySelectorAll<HTMLElement>('[data-experience-panel]');
    const section = host.current;
    const nav = document.querySelector('header nav');
    const viewport = section?.querySelector<HTMLElement>('[data-scene-viewport]');
    if (!panels?.length || !section || !viewport) return;
    const measure = () => {
      // Include the fixed header's top inset and allow room for Nastaliq ascenders.
      section.style.setProperty('--hero-header-bottom', `${nav?.getBoundingClientRect().bottom ?? 80}px`);
      const height = viewport.offsetHeight;
      const heights = Array.from(panels, panel => panel.offsetHeight);
      setLayout(previous => previous.viewport === height && previous.heights.every((h, i) => h === heights[i])
        ? previous : { viewport: height, heights });
    };
    const observer = new ResizeObserver(measure);
    panels.forEach(panel => observer.observe(panel));
    observer.observe(viewport);
    if (nav) observer.observe(nav);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const webgl = useWebGL();
  const { scrollYProgress } = useScroll({ target: host, offset: ['start start', 'end end'] });
  const stage = useTransform(scrollYProgress, p => {
    const total = layout.heights.reduce((sum, height) => sum + height, 0);
    const distance = p * (total + (TAIL - 1) * layout.viewport);
    let start = 0;
    for (let i = 0; i < layout.heights.length; i++) {
      const height = layout.heights[i];
      if (distance <= start + height) return i + (distance - start) / height;
      start += height;
    }
    return STAGES - 1 + TAIL;
  });
  const [current, setCurrent] = useState(0);
  useMotionValueEvent(stage, 'change', v => { const c = Math.min(STAGES - 1, Math.round(v)); setCurrent(p => (p === c ? p : c)); });
  const up = (i: number) => ({ style: { '--rise-delay': `${0.08 + i * 0.08}s` } as React.CSSProperties });
  const stages = t.story.stages;

  return (
    <section ref={host} id="experience" className="relative" style={{ height: layout.viewport === 1 ? `${(STAGES + TAIL) * 100}svh` : layout.heights.reduce((sum, h) => sum + h, 0) + TAIL * layout.viewport }}>
      {/* the model, pinned while the panels scroll over it */}
      <div data-scene-viewport className="sticky top-0 h-svh overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_68%_45%,#ffffff_0%,#eef3f8_55%,var(--page-bg)_100%)]" />
        <div className="rise-scene absolute inset-0">
          {webgl === false
            ? <div className="flex h-full justify-center pt-24 md:items-center md:ps-[40%] md:pt-0"><ToothArt className="h-[34%] w-auto md:h-[45%]" /></div>
            : webgl && <MouthScene stage={stage} still={reduce} host={host} />}
        </div>
        {/* keeps the text readable where it sits over the model */}
        <div className="pointer-events-none absolute inset-y-0 start-0 hidden w-[52%] bg-linear-to-r from-[var(--page-bg)] via-[var(--page-bg)]/80 to-transparent md:block rtl:bg-linear-to-l" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-linear-to-t from-[var(--page-bg)] via-[var(--page-bg)]/85 to-transparent md:hidden" />

        {/* progress rail */}
        <ol className="absolute end-5 top-1/2 hidden -translate-y-1/2 flex-col gap-3 lg:flex" aria-hidden="true">
          {stages.map((s, i) => (
            <li key={s.title} className="flex items-center justify-end gap-3">
              <span className={`text-[11px] font-medium transition-all duration-500 ${current === i + 1 ? 'text-ink opacity-100' : 'translate-x-1 text-muted opacity-0'}`}>{s.title}</span>
              <span className={`block h-px transition-all duration-500 ${current === i + 1 ? 'w-8 bg-brand' : 'w-4 bg-ink/20'}`} />
            </li>
          ))}
        </ol>
      </div>

      {/* the panels */}
      <div className="absolute inset-x-0 top-0">
        {/* 0: welcome */}
        <div data-experience-panel className="experience-hero flex items-end md:items-center">
          <div className="mx-auto w-full max-w-6xl px-5">
            <div className="max-w-xl">
              <p {...up(0)} className="rise eyebrow mb-6 flex items-center gap-3">
                <span className="h-px w-8 bg-brand" />{fill(t.hero.eyebrow, { city })}
              </p>
              <h1 className="experience-hero-title font-display text-balance text-[2.75rem] leading-[0.98] text-ink sm:text-6xl lg:text-[4.75rem]">
                <span {...up(1)} className="rise block">{t.hero.title1}</span>
                <span {...up(2)} className="rise block italic text-brand rtl:not-italic">{t.hero.title2}</span>
              </h1>
              <p {...up(3)} className="rise text-pretty mt-6 max-w-md text-[15px] sm:mt-7 leading-relaxed text-ink-soft sm:text-[17px]">{t.hero.sub}</p>
              <div {...up(4)} className="rise mt-7 flex sm:mt-9 flex-wrap items-center gap-3">
                <OpenChatButton className="px-6! py-3.5!">{t.hero.cta}<Arrow /></OpenChatButton>
                <a href="#treatments" className="inline-flex items-center rounded-full px-5 py-3.5 text-sm font-semibold text-ink ring-1 ring-ink/15 transition hover:bg-white">
                  {t.hero.secondary}
                </a>
              </div>
              <ul {...up(5)} className="rise mt-10 hidden flex-wrap gap-y-3 divide-x divide-line border-y border-line py-3 text-xs text-ink-soft sm:flex rtl:divide-x-reverse">
                {[openingDays, ...t.hero.chips.slice(1)].map(c => <li key={c} className="px-4 first:ps-0">{c}</li>)}
              </ul>
            </div>
          </div>
        </div>

        {/* 1-5: treatments */}
        {stages.map((s, i) => {
          const service = SERVICE[i + 1];
          return (
            <div key={s.title} data-experience-panel className="experience-treatment flex items-end md:items-center">
              <div className="mx-auto w-full max-w-6xl px-5">
                <motion.article
                  initial={reduce ? false : { opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ amount: 0.15, once: true }}
                  transition={{ duration: 0.7, ease: [0.25, 1, 0.5, 1] }}
                  className="experience-copy max-w-xl rounded-3xl bg-white/80 p-6 shadow-soft ring-1 ring-line backdrop-blur-xl md:bg-transparent md:p-0 md:shadow-none md:ring-0 md:backdrop-blur-none"
                >
                  <p className="eyebrow mb-5 flex items-center gap-3">
                    <span className="num text-2xl tracking-normal text-brand normal-case">{String(i + 1).padStart(2, '0')}</span>
                    <span className="h-px w-10 bg-brand/40" />
                    {t.story.eyebrow}
                  </p>
                  <h2 className="experience-treatment-title font-display text-balance text-[2.5rem] leading-[1.04] text-ink sm:text-5xl lg:text-[3.75rem]">
                    {s.title}
                    <span className="mt-2 block text-[0.82em] italic text-brand rtl:not-italic">{s.accent}</span>
                  </h2>
                  <p className="experience-description text-pretty mt-6 max-w-md text-[15px] leading-relaxed text-ink-soft sm:text-[17px]">{s.body}</p>
                  <p className="experience-detail mt-4 max-w-md border-s-2 border-brand/25 ps-4 text-sm leading-relaxed text-muted">{s.detail}</p>
                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    {service
                      ? <OpenChatButton book={{ service }} className="px-5! py-3!">{t.story.book}<Arrow /></OpenChatButton>
                      : <OpenChatButton variant="primary" message={fill(t.story.askMsg, { topic: s.title.toLowerCase() })} className="px-5! py-3!">{t.story.ask}<Arrow /></OpenChatButton>}
                    {service && <OpenChatButton variant="ghost" message={fill(t.story.askMsg, { topic: s.title })} className="px-5! py-3!">{t.story.ask}</OpenChatButton>}
                  </div>
                  <ul className="experience-points mt-7 flex flex-wrap gap-x-5 gap-y-3 border-y border-line py-3 text-xs text-ink-soft">
                    {s.points.map(point => <li key={point} className="flex items-center gap-2"><span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-brand" />{point}</li>)}
                  </ul>
                </motion.article>
              </div>
            </div>
          );
        })}
      </div>

      {/* scroll cue under the welcome panel */}
      <div className={`pointer-events-none fixed inset-x-0 bottom-6 z-10 hidden justify-center transition-opacity duration-500 md:flex ${current === 0 ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">
        <span className="flex items-center gap-3 text-[11px] font-medium tracking-[0.2em] text-muted uppercase">
          <span className="relative h-8 w-px overflow-hidden bg-ink/10"><span className="absolute inset-x-0 top-0 h-3 animate-[df-cue_1.8s_ease-in-out_infinite] bg-brand" /></span>
          {t.story.scroll}
        </span>
      </div>
    </section>
  );
}
