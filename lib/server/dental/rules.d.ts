import type { Row, Doctor, BusyResponse } from './types';
export const DF: {
  clean(v: unknown): string;
  toMin(v: unknown): number;
  toHHMM(v: number): string;
  parts(iso: string, tz: string): { date: string; min: number };
  dayName(date: string, tz: string): string;
  settings(rows: Row[]): Record<string, string>;
  services(rows: Row[]): { id: string; name: string; min: number; price: number; active: boolean }[];
  doctors(rows: Row[], fallback: string, name: string): Doctor[];
  doesService(d: Doctor, id: string): boolean;
  eligible(docs: Doctor[], service: string, wanted: string): Doctor[];
  busyFor(
    fb: BusyResponse,
    id: string,
    day: string,
    tz: string,
    asked: string[],
  ): { ok: boolean; blocks: number[][] };

};
