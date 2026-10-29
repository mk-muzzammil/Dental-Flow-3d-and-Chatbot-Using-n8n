import "server-only";
import { collection } from "../db";
import { digest } from "../security";
import { AppError } from "../config";
import type { BusyResponse } from "../google/api";
type Claim = { id: string; start: number; end: number };
type Reservations = {
  _id: string;
  calendarId: string;
  date: string;
  claims: Claim[];
};
export async function reserve(
  calendarId: string,
  date: string,
  claim: Claim,
  ignoreBooking?: string,
) {
  const records = await collection<Reservations>("booking_reservations"),
    _id = digest(`${calendarId}:${date}`);
  await records
    .updateOne(
      { _id },
      { $setOnInsert: { calendarId, date, claims: [] } },
      { upsert: true },
    )
    .catch(async (e) => {
      if (e?.code !== 11000) throw e;
    });
  const previous = await records.findOne({ _id, "claims.id": claim.id });
  if (previous) {
    const old = previous.claims.find((c) => c.id === claim.id)!;
    if (old.start !== claim.start || old.end !== claim.end)
      throw new AppError("reservation-conflict", 409);
    return;
  }
  const result = await records.updateOne(
    {
      _id,
      claims: {
        $not: {
          $elemMatch: {
            start: { $lt: claim.end },
            end: { $gt: claim.start },
            ...(ignoreBooking
              ? { id: { $not: { $regex: `^${ignoreBooking}(:move:.*)?$` } } }
              : {}),
          },
        },
      },
    },
    { $push: { claims: claim } },
  );
  if (!result.matchedCount) throw new AppError("slot-taken", 409);
}
export async function releaseReservation(id: string, keep?: string) {
  const match = {
    $regex: `^${id}(:move:.*)?$`,
    ...(keep ? { $ne: keep } : {}),
  };
  await (
    await collection<Reservations>("booking_reservations")
  ).updateMany({}, { $pull: { claims: { id: match } } });
}
export async function addReservations(
  busy: BusyResponse,
  calendars: string[],
  ignore?: string,
) {
  const rows = await (await collection<Reservations>("booking_reservations"))
    .find({ calendarId: { $in: calendars } })
    .toArray();
  for (const row of rows) {
    const cal = busy.calendars?.[row.calendarId];
    if (!cal) continue;
    cal.busy ??= [];
    for (const c of row.claims)
      if (c.id !== ignore && !c.id.startsWith(`${ignore}:move:`))
        cal.busy.push({
          start: new Date(c.start).toISOString(),
          end: new Date(c.end).toISOString(),
        });
  }
  return busy;
}
