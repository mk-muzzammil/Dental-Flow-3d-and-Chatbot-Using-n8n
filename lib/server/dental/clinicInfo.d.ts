import type { Row } from './types';
export type SheetReply = { statusCode: number; body?: { valueRanges?: { values: Row[] }[]; values?: Row[] } };
export type ClinicInfo = { ok: boolean; promptBlock?: string; [key: string]: unknown };
export function buildClinicInfo(
  config: Record<string, string>,
  sheet: SheetReply,
  faq: SheetReply,
  specs: SheetReply,
): ClinicInfo;
