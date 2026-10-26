export const instruction = [
  "This is a voice message a visitor recorded in the chat on a dental clinic's website.",
  'Write down exactly what the visitor says, in the language they say it. Do not translate, summarise, answer or add anything.',
  'Urdu is written in Urdu script, Arabic in Arabic script, English in English. Write times, dates, phone numbers and other numbers with the digits 0-9.',
  'Write an email address the way it is written, for example ali.khan@gmail.com.',
  'Reply with JSON only: {"text": "<the words>", "language": "en" | "ur" | "ar" | "other", "clear": true | false}',
  'If there is no speech, or you cannot make out what is said, reply {"text": "", "language": "other", "clear": false}. Never guess words you did not hear.',
].join('\n');
