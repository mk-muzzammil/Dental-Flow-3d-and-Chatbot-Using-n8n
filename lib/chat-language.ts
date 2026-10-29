import type { HistoryItem } from './chat-types';
export type ReplyLanguage = 'en' | 'roman-ur';

/** Short answers, contact details and greetings retain the conversation's language. */
function expressedLanguage(text: string): ReplyLanguage | undefined {
  const value = text.trim().toLowerCase();
  if (/\b(?:reply|respond|answer|speak)\b.{0,30}\benglish\b|\benglish\s+(?:please|mein|me|mai)\b/.test(value)) return 'en';
  if (/\b(?:roman\s*urdu|urdu\s+(?:mein|me|mai|please))\b/.test(value)) return 'roman-ur';
  if (/[\u0600-\u06ff]/.test(value)) return 'roman-ur';
  if (/\b(?:kya|kaise|kaisa|kaisi|chahiye|chahta|chahti|batao|bataein|batayein|karwana|karwani|karein|dekhein|dekhna)\b/.test(value)) return 'roman-ur';
  const words=value.match(/\b(?:aap|ap|mujhe|meri|mera|mere|hai|hain|hoon|hun|dant|dard|mein|nahi|theek|thik|hal)\b/g) || [];
  if (words.length >= 2) return 'roman-ur';
  if (/\b(?:what|when|where|how|why|which)\b|\b(?:can|could|would) you\b|\bi (?:want|need|have|would)\b|\bplease (?:tell|show|book|cancel)\b/.test(value)) return 'en';
}
export function replyLanguage(message: string, uiLanguage: string, history: HistoryItem[] = []): ReplyLanguage {
  const latest = expressedLanguage(message);
  if (latest) return latest;
  for (const item of [...history].reverse()) {
    if (item.role !== 'user') continue;
    const language = expressedLanguage(item.text);
    if (language) return language;
  }
  return uiLanguage === 'ur' || uiLanguage === 'roman-ur' ? 'roman-ur' : 'en';
}
