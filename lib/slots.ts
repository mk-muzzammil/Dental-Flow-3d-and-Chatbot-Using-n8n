/** Free times, as the booking panel uses them (shared by the browser and the /api/slots route). */
import type { Lang } from './i18n';
import { LOCALE } from './format';

/** "Monday, 12 October" in the visitor's language. */
export const dayTitle = (lang: Lang, ymd: string, short = false) =>
  new Date(ymd + 'T12:00:00Z').toLocaleDateString(LOCALE[lang], {
    timeZone: 'UTC', weekday: short ? 'short' : 'long', day: 'numeric', month: short ? 'short' : 'long',
  });

/** "3:00 PM" (Arabic: "3:00 م"). */
export const clock = (lang: Lang, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const pm = h >= 12;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${lang === 'ar' ? (pm ? 'م' : 'ص') : pm ? 'PM' : 'AM'}`;
};

/** Today and the following days as YYYY-MM-DD, in the clinic's time zone. */
export function nextDays(n: number, tz = 'Asia/Karachi') {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return Array.from({ length: n }, (_, i) => new Date(Date.parse(today + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10));
}


const weekdayUrdu: Record<string, string> = {
  Monday: 'پیر', Tuesday: 'منگل', Wednesday: 'بدھ', Thursday: 'جمعرات',
  Friday: 'جمعہ', Saturday: 'ہفتہ', Sunday: 'اتوار',
};
export const weekdayLabel = (lang: Lang, day: string) => lang === 'ur' ? weekdayUrdu[day] || day : day;
