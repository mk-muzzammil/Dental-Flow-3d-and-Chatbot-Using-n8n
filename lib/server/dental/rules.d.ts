import type { Row, Doctor, BusyResponse } from './types';
type Hours = { open: number; close: number; brk: number[] | null };
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
  hoursFor(rows: Row[], doctor: string, dow: string): Hours | null;
  busyFor(
    fb: BusyResponse,
    id: string,
    day: string,
    tz: string,
    asked: string[],
  ): { ok: boolean; blocks: number[][] };
  fits(start: number, dur: number, buffer: number, hours: Hours | null, blocks: number[][]): boolean;
  freeTimes(args: {
    dur: number;
    buffer: number;
    gran: number;
    earliest: number;
    h: Hours | null;
    blocks: number[][];
  }): string[];
  busyMinutes(blocks: number[][]): number;
};
