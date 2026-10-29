'use client';
import { useParams } from 'next/navigation';
import { LoadingIndicator } from './LoadingIndicator';
export function RouteLoading() {
  const { lang } = useParams<{ lang?: string }>();
  return <LoadingIndicator page label={lang === 'ur' ? 'صفحہ لوڈ ہو رہا ہے…' : lang === 'ar' ? 'جارٍ تحميل الصفحة…' : 'Loading page…'} />;
}
