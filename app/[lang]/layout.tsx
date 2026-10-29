import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PUBLIC_LANGS, dictionaries, dirOf, isLang, isPublicLang } from '@/lib/i18n';
import { publicClinic } from '@/lib/server/storage/public-clinic';
export const dynamic = 'force-dynamic';
import { ReadyGate } from '@/components/ReadyGate';
import '../globals.css';

// Runs before anything is drawn: marks that JavaScript is on (so the loading screen and the hero's
// entrance may wait for the 3D tooth), with a safety net that lifts the loading screen after 9 seconds.
const BOOT = "document.documentElement.classList.add('js');setTimeout(function(){document.documentElement.setAttribute('data-ready','')},9000);";

export const dynamicParams = false;
export function generateStaticParams() {
  return PUBLIC_LANGS.map(lang => ({ lang }));
}

export const viewport: Viewport = { themeColor: '#f7fafc', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang) || !isPublicLang(lang)) return {};
  const { clinic } = await publicClinic();
  const t = dictionaries[lang];
  const title = `${clinic.name[lang]} · ${t.meta.title}`;
  return {
    title,
    description: t.meta.description,
    alternates: { languages: Object.fromEntries(PUBLIC_LANGS.map(l => [l, `/${l}`])) },
    openGraph: { title, description: t.meta.description, type: 'website', locale: lang },
    icons: { icon: '/icon.svg' },
  };
}

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang) || !isPublicLang(lang)) notFound();
  return (
    <html lang={lang} dir={dirOf(lang)} suppressHydrationWarning>
      <body>
        {/* Next's own way to run a tiny script before the page starts (a plain <script> tag makes React warn) */}
        <Script id="df-boot" strategy="beforeInteractive">{BOOT}</Script>
        <div className="df-loader" aria-hidden="true">
          <LoadingIndicator label={lang === 'ur' ? 'ویب سائٹ لوڈ ہو رہی ہے…' : lang === 'ar' ? 'جارٍ تحميل الموقع…' : 'Loading website…'} />
        </div>
        <ReadyGate />
        {children}
      </body>
    </html>
  );
}
