import test from 'node:test';
import assert from 'node:assert/strict';
import { replyLanguage } from '../lib/chat-language';
import { PUBLIC_LANGS, dictionaries } from '../lib/i18n';
import { prepareReply } from '../lib/server/chat/reply.js';

test('Urdu questions use Roman Urdu; explicit English questions switch back', () => {
  assert.equal(replyLanguage('kya hal hai thk ho', 'en'), 'roman-ur');
  assert.equal(replyLanguage('مجھے اپائنٹمنٹ چاہیے', 'en'), 'roman-ur');
  assert.equal(replyLanguage('Hello', 'ur'), 'roman-ur');
  assert.equal(replyLanguage('What time does the clinic open?', 'ur'), 'en');
  assert.equal(replyLanguage('yes', 'en', [{role:'user',text:'mujhe appointment chahiye'}]), 'roman-ur');
  assert.equal(replyLanguage('Reply in English please', 'ur'), 'en');
});
test('Roman Urdu formatting keeps the response language', () => {
  const result = prepareReply({uiLang:'roman-ur',CLINIC_PHONE:'',isVoice:false}, {output:'Aap kis din aana chahte hain?',intermediateSteps:[]});
  assert.equal(result.response.lang, 'roman-ur');
  assert.match(result.response.reply, /Aap kis din/);
});
test('Arabic translations remain stored but are not publicly selectable', () => {
  assert.deepEqual([...PUBLIC_LANGS], ['en','ur']);
  assert.ok(dictionaries.ar.meta.title);
});
