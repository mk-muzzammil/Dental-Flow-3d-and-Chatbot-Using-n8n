import "server-only";
import {
  appointments,
  identity,
  matches,
  refKey,
  startAt,
  when,
  type Booking,
} from "./appointments";
import { availabilityContext } from "./clinic";
import { calculateDay, availabilityVersion } from "./availability";
import { AppError } from "../config";
import { settings } from "../google/settings";
import { withLease } from "../operations/lease";
import { operate, type Operation } from "../operations/journal";
import { reserve, releaseReservation } from "./reservations";
import { googleRequest, patchEvent } from "../google/api";
import { sheetValues, type PrivateBooking } from "../storage/worksheets";
import { collection } from "../db";
import { secretHash, decrypt, encrypt } from "../security";
import { confirmation } from "./notifications";
import { sendEmail } from "../google/api";
import type { Contact } from "@/lib/appointments";
export async function authorizedBooking(reference: string, contact: Contact) {
  const found = (await appointments()).find(
    ({ booking: b }) =>
      refKey(b.reference) === refKey(reference) && matches(b, contact),
  )?.booking;
  if (!found) throw new AppError("not-found", 404);
  if (!["PENDING", "CONFIRMED"].includes(found.status))
    throw new AppError("not-active", 409);
  if (
    startAt(found) <= Date.now() &&
    !(await (
      await collection<PrivateBooking>("booking_private")
    ).findOne({ bookingId: identity(found), pendingMove: { $exists: true } }))
  )
    throw new AppError("past", 409);
  return found;
}
export async function rescheduleSlots(b: Booking, date?: string) {
  const ctx = await availabilityContext(
    b.serviceId,
    b.doctorId,
    undefined,
    identity(b),
    b,
  );
  if (date)
    return calculateDay(ctx.data, ctx.docs, ctx.busy, b.serviceId, date);
  const days = ctx.week.map((day) =>
    calculateDay(ctx.data, ctx.docs, ctx.busy, b.serviceId, day),
  );
  return {
    timezone: ctx.timezone,
    version: availabilityVersion(ctx.data),
    durationMin: days[0].durationMin,
    serviceName: days[0].serviceName,
    days: days.map((d) => ({
      date: d.date,
      available: !!d.options.length,
      count: d.options.length,
      reason: d.reason,
    })),
    options: [],
    reason: days.some((d) => d.options.length)
      ? undefined
      : "nothing-free-this-week",
  };
}
export async function rescheduleBooking(
  reference: string,
  contact: Contact,
  input: { date: string; time: string; version: string },
  requestKey: string,
) {
  const initial = await authorizedBooking(reference, contact),
    id = identity(initial),
    selected = await settings();
  return withLease(`clinic-settings:${selected.sheetId}`, () =>
    withLease(`booking:${id}`, () =>
      operate(
        "reschedule",
        requestKey,
        secretHash(JSON.stringify({ id, input })),
        async (journal) => {
          const records = await collection<PrivateBooking>("booking_private"),
            recordId = `${selected.sheetId}:${id}`;
          let context = journal.context<{
            old: Booking;
            updated: Booking;
            claimId: string;
            input: typeof input;
            requestKey: string;
          }>();
          if (!context) {
            const latest = await authorizedBooking(reference, contact),
              availability = await rescheduleSlots(latest, input.date),
              option = availability.options.find((o) => o.time === input.time);
            if (input.version !== availability.version)
              throw new AppError("configuration-changed", 409);
            if (!option)
              throw new AppError(availability.reason || "slot-taken", 409);
            context = {
              old: latest,
              updated: {
                ...latest,
                date: option.date,
                time: option.time,
                endTime: option.endTime,
                startsAt: option.startsAt,
                endsAt: option.endsAt,
                timezone: availability.timezone,
                minutes: availability.durationMin,
              },
              claimId: `${id}:move:${journal.id}`,
              input,
              requestKey,
            };
            await journal.saveContext(context);
          }
          const { old, updated, claimId } = context;
          const acquired = await records.updateOne(
            {
              _id: recordId,
              $or: [
                { pendingMove: { $exists: false } },
                { pendingMove: journal.id },
              ],
            },
            { $set: { pendingMove: journal.id } },
          );
          if (!acquired.matchedCount)
            throw new AppError("booking-update-pending", 409);
          try {
            await reserve(
              updated.calendarId,
              updated.date,
              {
                id: claimId,
                start: Date.parse(updated.startsAt!),
                end: Date.parse(updated.endsAt!),
              },
              id,
            );
          } catch (error) {
            await records.updateOne(
              { _id: recordId, pendingMove: journal.id },
              { $unset: { pendingMove: "" } },
            );
            throw error;
          }
          const event = await journal.step("calendar", async () => {
            const current = await googleRequest<{
              start?: { dateTime?: string };
              end?: { dateTime?: string };
            }>(
              "calendar",
              `/calendars/${encodeURIComponent(old.calendarId)}/events/${encodeURIComponent(old.eventId)}`,
            );
            if (
              Date.parse(current.start?.dateTime || "") ===
                Date.parse(updated.startsAt!) &&
              Date.parse(current.end?.dateTime || "") ===
                Date.parse(updated.endsAt!)
            )
              return current;
            const fresh = await rescheduleSlots(old, updated.date);
            if (
              fresh.version !== input.version ||
              !fresh.options.some(
                (o) =>
                  o.startsAt === updated.startsAt &&
                  o.endsAt === updated.endsAt,
              )
            ) {
              await releaseReservation(claimId);
              await records.updateOne(
                { _id: recordId, pendingMove: journal.id },
                { $unset: { pendingMove: "" } },
              );
              throw new AppError("slot-taken", 409);
            }
            return patchEvent(old.calendarId, old.eventId, {
              start: { dateTime: updated.startsAt, timeZone: updated.timezone },
              end: { dateTime: updated.endsAt, timeZone: updated.timezone },
            });
          });
          await journal.step("sheet", async () => {
            const [rows] = await sheetValues(selected.sheetId, [
                "Appointments!A:N",
              ]),
              index = rows.findIndex((r) => r[0] === id);
            if (index < 1) throw new AppError("booking-not-found", 404);
            const r = rows[index];
            r[7] = updated.date;
            r[8] = updated.time;
            r[9] = updated.minutes;
            r[13] = updated.endTime!;
            await googleRequest(
              "sheets",
              `/spreadsheets/${selected.sheetId}/values/Appointments!A${index + 1}:N${index + 1}?valueInputOption=RAW`,
              { method: "PUT", body: { values: [r] } },
            );
            const [verify] = await sheetValues(selected.sheetId, [
              "Appointments!A:N",
            ]);
            if (
              !verify.some(
                (r) =>
                  r[0] === id &&
                  r[7] === updated.date &&
                  r[8] === updated.time &&
                  r[13] === updated.endTime,
              )
            )
              throw new AppError("sheet-update-unconfirmed");
          });
          await journal.step("private", async () => {
            const record = await records.findOne({ _id: recordId });
            if (!record) throw new AppError("booking-data-incomplete");
            const purpose = `booking-private:${recordId}`,
              hidden = JSON.parse(decrypt(record.data, purpose));
            await records.updateOne(
              { _id: recordId },
              {
                $set: {
                  data: encrypt(
                    JSON.stringify({
                      ...hidden,
                      startsAt: updated.startsAt,
                      endsAt: updated.endsAt,
                      timezone: updated.timezone,
                      endTime: updated.endTime,
                    }),
                    purpose,
                  ),
                },
              },
            );
          });
          await releaseReservation(id, claimId);
          await records.updateOne(
            { _id: recordId, pendingMove: journal.id },
            { $unset: { pendingMove: "" } },
          );
          let emailCopy = false;
          try {
            const mail = await confirmation(
              updated,
              event as Parameters<typeof confirmation>[1],
            );
            await journal.step(
              "email",
              () =>
                sendEmail(
                  updated.email,
                  `Updated appointment: ${updated.reference}`,
                  mail.html,
                  journal.id,
                ),
              undefined,
              true,
            );
            emailCopy = true;
          } catch {}
          await journal.setIdentity(id, reference);
          return {
            ok: true,
            reference,
            service: updated.service,
            dentist: updated.dentist,
            when: when(updated),
            emailCopy,
            whatsappSent: false,
            date: updated.date,
            time: updated.time,
            endTime: updated.endTime,
            minutes: updated.minutes,
          };
        },
      ),
    ),
  );
}

export async function pendingReschedule(
  reference: string,
  contact: Contact,
  resume = false,
) {
  const b = await authorizedBooking(reference, contact),
    selected = await settings();
  const record = await (
    await collection<PrivateBooking>("booking_private")
  ).findOne({ _id: `${selected.sheetId}:${identity(b)}` });
  if (!record?.pendingMove) return { pending: false };
  if (!resume) return { pending: true };
  const op = await (
    await collection<Operation>("operation_journal")
  ).findOne({ _id: record.pendingMove });
  if (!op?.context) throw new AppError("recovery-record-missing");
  const context = JSON.parse(decrypt(op.context, `context:${op._id}`));
  return rescheduleBooking(
    reference,
    contact,
    context.input,
    context.requestKey,
  );
}
