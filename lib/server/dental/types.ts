import type { Row, BusyResponse, GoogleEvent } from '../google/api';
export type { Row, BusyResponse };
export type Doctor = {
  id: string;
  name: string;
  calendarId: string;
  services: string;
  email: string;
  active: boolean;
  implicit?: boolean;
};
export type SlotConfig = {
  CALENDAR_ID: string;
  CLINIC_NAME: string;
  service: string;
  doctor: string;
  date: string;
  listOnly: boolean;
  next: boolean;
  lang: string;
  NEXT_DAYS: number;
};
export type DoctorChoice = {
  answerNow?: boolean;
  response?: SlotResult;
  eligible: Doctor[];
  freeBusyItems: { id: string }[];
};
export type SlotResult = {
  reason?: string;
  doctors?: { id: string; name: string; services?: string[] }[];
  slots?: string[];
  byDoctor?: { doctor: string; doctorName: string; slots: string[] }[];
  options?: { date: string; time: string; doctor: string; doctorName: string; label: string }[];
  [key: string]: unknown;
};
export type BookingInput = {
  service: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  doctor: string;
  language: string;
  firstVisit?: boolean;
};
export type HoldInput = BookingInput & {
  ref: string;
  token: string;
  CALENDAR_ID: string;
  CLINIC_NAME: string;
};
export type Hold = HoldInput & {
  free: boolean;
  reason: string;
  event: GoogleEvent & Record<string, unknown>;
  timezone: string;
  holdMinutes: number;
  doctorId: string;
  doctorName: string;
  calendarId: string;
  serviceName: string;
  price: number;
  durationMin: number;
  expiresAt: string;
  prettyDate: string;
  prettyTime: string;
};
