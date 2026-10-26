import type { Lang } from './i18n';

/** Locale for dates and numbers. Arabic uses Western digits and the Gregorian calendar, throughout the website. */
export const LOCALE: Record<Lang, string> = { en: 'en-GB', ur: 'ur-PK', ar: 'ar-u-nu-latn-ca-gregory' };

export const money = (lang: Lang, amount: number, currency: string) =>
  `${new Intl.NumberFormat(LOCALE[lang]).format(amount)} ${currency}`;

export const minutes = (lang: Lang, n: number, word: string) => `${new Intl.NumberFormat(LOCALE[lang]).format(n)} ${word}`;
