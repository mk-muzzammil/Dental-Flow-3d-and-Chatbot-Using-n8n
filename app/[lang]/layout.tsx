import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { LANGS, dictionaries, dirOf, isLang } from '@/lib/i18n';
import { publicClinic } from '@/lib/server/storage/public-clinic';
export const dynamic = 'force-dynamic';
import { ReadyGate } from '@/components/ReadyGate';
import '../globals.css';

// Runs before anything is drawn: marks that JavaScript is on (so the loading screen and the hero's
// entrance may wait for the 3D tooth), with a safety net that lifts the loading screen after 9 seconds.
const BOOT = "document.documentElement.classList.add('js');setTimeout(function(){document.documentElement.setAttribute('data-ready','')},9000);";

export const dynamicParams = false;
export function generateStaticParams() {
  return LANGS.map(lang => ({ lang }));
}

export const viewport: Viewport = { themeColor: '#f7fafc', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const { clinic } = await publicClinic();
  const t = dictionaries[lang];
  const title = `${clinic.name[lang]} · ${t.meta.title}`;
  return {
    title,
    description: t.meta.description,
    alternates: { languages: Object.fromEntries(LANGS.map(l => [l, `/${l}`])) },
    openGraph: { title, description: t.meta.description, type: 'website', locale: lang },
    icons: { icon: '/icon.svg' },
  };
}

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const { clinic } = await publicClinic();
  return (
    <html lang={lang} dir={dirOf(lang)} suppressHydrationWarning>
      <body>
        {/* Next's own way to run a tiny script before the page starts (a plain <script> tag makes React warn) */}
        <Script id="df-boot" strategy="beforeInteractive">{BOOT}</Script>
        <div className="df-loader" aria-hidden="true">
          <div className="df-loader__inner">
            <div className="df-loader__mark">
              <svg className="df-loader__ring" viewBox="0 0 76 76" fill="none">
                <circle cx="38" cy="38" r="35" stroke="url(#df-ring)" strokeWidth="2.5" />
                <defs><linearGradient id="df-ring" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#0e7490" /><stop offset="1" stopColor="#2b7bea" /></linearGradient></defs>
              </svg>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br from-brand to-accent text-white shadow-lift">
                <svg viewBox="0 0 24 24" className="h-7 w-7"><path fill="currentColor" d="M12 3.2c-2-1.3-6.4-1.3-7.7 1.6-1.3 2.9.2 6.4 1.1 8.6.9 2.4.7 6.6 2.4 8.4 1.3 1.3 2.2-.7 2.4-2.6.2-1.8.7-3.7 1.8-3.7s1.6 1.9 1.8 3.7c.2 1.9 1.1 3.9 2.4 2.6 1.7-1.8 1.5-6 2.4-8.4.9-2.2 2.4-5.7 1.1-8.6C18.4 1.9 14 1.9 12 3.2z" /></svg>
              </span>
            </div>
            <p className="df-loader__name">{clinic.name[lang]}</p>
            <div className="df-loader__bar" />
          </div>
        </div>
        <ReadyGate />
        {children}
      </body>
    </html>
  );
}
