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
  version?: string;
};
export type HoldInput = BookingInput & {
  ref: string;
  token: string;
  CALENDAR_ID: string;
  CLINIC_NAME: string;
};
export type Hold = HoldInput & {
  startsAt: string; endsAt: string; endTime: string;
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
