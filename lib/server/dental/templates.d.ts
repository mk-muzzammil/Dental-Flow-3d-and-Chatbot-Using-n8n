import type { Booking } from './appointments';
import type { GoogleEvent } from '../google/api';
export function confirmationTemplate(
  b: Booking,
  c: Record<string, string>,
  ev?: GoogleEvent,
): { html: string; email: string; subject: string };
export function cancelledTemplate(b: Booking, c: Record<string, string>): { html: string };
export function expiryTemplate(b: Booking, c: Record<string, string>): { html: string; subject: string };
export function cancellationEmailTemplate(
  b: Booking,
  c: Record<string, string>,
  ev: GoogleEvent | undefined,
  label: string,
): { email: string; subject: string };
