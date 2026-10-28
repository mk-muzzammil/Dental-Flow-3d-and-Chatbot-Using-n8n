import { dictionaries } from './i18n';
import { readContact } from './appointments';

export type ChatAction = 'book' | 'view' | 'cancel' | 'never' | 'another';
const normalize = (text: string) => text.toLowerCase().normalize('NFKC')
  .replace(/[\u200b-\u200f\u2066-\u2069]/g, '').replace(/[.!?؟،,]+$/g, '').trim().replace(/\s+/g, ' ');
const actions: [ChatAction, string[]][] = [
  ['book', ['book appointment', 'book an appointment', 'book a new appointment', 'nayi appointment book karein', ...Object.values(dictionaries).map(d => d.chat.starters[0])]],
  ['view', ['view my appointment', 'view appointment', 'view appointments', 'my appointments', 'show my appointment', 'show my appointments', 'show my bookings', 'view my bookings', 'check my appointments', 'meri appointments dekhein', 'meri appointment dikhao', 'میری اپائنٹمنٹ دکھائیں', 'اعرض مواعيدي', ...Object.values(dictionaries).map(d => d.chat.starters[1])]],
  ['cancel', ['cancel appointment', 'cancel my appointment', 'cancel my appointments', 'cancel my booking', 'appointment cancel karein', 'میری اپائنٹمنٹ منسوخ کریں', 'إلغاء موعدي', ...Object.values(dictionaries).map(d => d.chat.starters[2])]],
  ['never', Object.values(dictionaries).map(d => d.chat.neverMind)],
  ['another', Object.values(dictionaries).map(d => d.chat.tryAnother)],
];

/** Recognize explicit navigation requests only; never interpret these as permission to cancel a booking. */
export function chatAction(text: string): ChatAction | null {
  let n = normalize(text).replace(/^(?:please\s+|can (?:i|you)\s+|could you\s+|i (?:want|would like) to\s+)+/, '').replace(/\s+please$/, '');
  const contact = readContact(n);
  if (contact) {
    // Supports “view my appointments for name@example.com” without another contact prompt.
    n = n.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/, '').replace(/\+?\d[\d ()-]{8,}\d/g, '')
      .replace(/\s+(?:for|using|with|under|on|phone|email|number)\s*:?\s*$/g, '').trim();
  }
  return actions.find(([, labels]) => labels.some(label => normalize(label) === n))?.[0] ?? null;
}
