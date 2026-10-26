import type { ChatResponse } from '@/lib/chat-types';
export function prepareReply(
  config: { CLINIC_PHONE: string; uiLang: string; isVoice: boolean },
  input: { output: unknown; intermediateSteps: { action: { tool: string }; observation: unknown }[] },
  heard?: { heard: boolean; said: string },
): { response: ChatResponse; modelError: string };
