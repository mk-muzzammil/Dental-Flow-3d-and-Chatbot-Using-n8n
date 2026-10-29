import type { ChatResponse } from './chat-types';
import { dictionaries } from './i18n';

const questions = {
  en: { general: 'What else can I help you with?', booking: 'Would you like to view your appointments or ask another question?', options: 'Which option would you prefer?' },
  ur: { general: 'میں آپ کی مزید کیا مدد کر سکتا ہوں؟', booking: 'کیا آپ اپنی اپائنٹمنٹس دیکھنا چاہیں گے یا کوئی اور سوال پوچھنا چاہیں گے؟', options: 'آپ کون سا آپشن منتخب کرنا چاہیں گے؟' },
  ar: { general: 'كيف يمكنني مساعدتك أيضاً؟', booking: 'هل تود عرض مواعيدك أو طرح سؤال آخر؟', options: 'أي خيار تفضل؟' },
  'roman-ur': { general: 'Main aap ki mazeed kya madad kar sakta hoon?', booking: 'Kya aap apni appointments dekhna chahenge ya koi aur sawal poochna chahenge?', options: 'Aap kaunsa option pasand karenge?' },
};

export function withFollowUp(text: string, lang: string, kind: 'general' | 'booking' | 'options' = 'general') {
  const value = text.trim();
  const lastParagraph = value.split(/\n\s*\n/).pop() || '';
  if (/[?؟]/.test(lastParagraph)) return value;
  const copy = questions[lang as keyof typeof questions] || questions.en;
  return `${value}${value ? '\n\n' : ''}${copy[kind]}`;
}

/** Keep a useful next step even when the model omits one, including scripted demo replies. */
export function continueChat(response: ChatResponse): ChatResponse {
  const lang = response.lang;
  const t = dictionaries[lang === 'roman-ur' ? 'ur' : lang === 'ur' || lang === 'ar' ? lang : 'en'].chat;
  const quickReplies = response.booking
    ? [t.starters[1], t.starters[2], t.starters[0]].map(title => ({ title, value: title }))
    : response.quickReplies;
  return { ...response, quickReplies, reply: withFollowUp(response.reply, lang,
    response.booking ? 'booking' : response.carousel || quickReplies.length ? 'options' : 'general') };
}
