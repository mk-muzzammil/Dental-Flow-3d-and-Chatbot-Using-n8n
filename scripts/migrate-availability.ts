/** Read-only by default. --apply changes only the selected website workbook and MongoDB configuration. */
import { loadEnvConfig } from "@next/env";
import { collection, retentionDate } from "../lib/server/db";
import { settings } from "../lib/server/google/settings";
import {
  googleRequest,
  type Row,
  type GoogleEvent,
} from "../lib/server/google/api";
import {
  sheetValues,
  type PrivateBooking,
} from "../lib/server/storage/worksheets";
import { type StorageProfile } from "../lib/server/storage/profile";
import { encrypt, decrypt, digest } from "../lib/server/security";
import { withLease } from "../lib/server/operations/lease";
import { localInstant, clockAt, validDuration } from "../lib/availability";
loadEnvConfig(process.cwd());
async function main() {
  const selected = await settings(),
    index = process.argv.indexOf("--sheet-id"),
    sheetId = process.argv[index + 1];
  if (
    index < 0 ||
    sheetId !== selected.sheetId ||
    sheetId === "1N-qE4v81o0uxyXxLFeCamHSkvALFQIixrES3K6-hE6c"
  )
    throw new Error(
      "Specify the selected website Sheet ID. The n8n workbook is excluded.",
    );
  const apply = process.argv.includes("--apply");
  return withLease(`clinic-settings:${sheetId}`, async () => {
    const profiles = await collection<StorageProfile>("clinic_configuration"),
      profile = await profiles.findOne({ _id: sheetId });
    if (!profile)
      throw new Error("Clean-workbook migration is required first.");
    const [rows] = await sheetValues(sheetId, ["Appointments!A:N"]);
    if (profile.availabilityVersion === 2 && rows[0]?.[13] === "end_time") {
      console.log("Already migrated; no changes.");
      return;
    }
    const privateRecords = await (
        await collection<PrivateBooking>("booking_private")
      )
        .find({ sheetId })
        .toArray(),
      privateMap = new Map(privateRecords.map((r) => [r.bookingId, r]));
    const timezone = String(
      profile.configuration.settings.find((r) => r[0] === "timezone")?.[1] ||
        "Asia/Karachi",
    );
    const proposals: {
        id: string;
        data: ReturnType<typeof encrypt>;
        endTime: string;
        row: number;
      }[] = [],
      issues: string[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      const record = privateMap.get(String(r[0]));
      if (!record) {
        issues.push(`Row ${i + 1}: missing private booking record`);
        continue;
      }
      const purpose = `booking-private:${record._id}`,
        hidden = JSON.parse(decrypt(record.data, purpose));
      try {
        const start = localInstant(
            String(r[7]),
            String(r[8]),
            hidden.timezone || timezone,
          ),
          end = start + Number(r[9]) * 60000;
        if (!Number.isFinite(end) || end <= start)
          throw new Error("invalid saved duration");
        if (["PENDING", "CONFIRMED"].includes(String(r[3]))) {
          const event = await googleRequest<GoogleEvent>(
            "calendar",
            `/calendars/${encodeURIComponent(hidden.calendarId || selected.calendarId)}/events/${encodeURIComponent(hidden.eventId)}`,
          );
          if (
            event.status === "cancelled" ||
            Date.parse(event.start?.dateTime || "") !== start ||
            Date.parse(event.end?.dateTime || "") !== end
          )
            throw new Error(
              "Calendar interval differs from stored booking; reconcile before migration",
            );
        }
        const endTime = clockAt(end, hidden.timezone || timezone);
        proposals.push({
          id: record._id,
          data: encrypt(
            JSON.stringify({
              ...hidden,
              startsAt: new Date(start).toISOString(),
              endsAt: new Date(end).toISOString(),
              timezone: hidden.timezone || timezone,
              endTime,
            }),
            purpose,
          ),
          endTime,
          row: i,
        });
      } catch (error) {
        issues.push(`Row ${i + 1}: interval could not be verified`);
      }
    }
    const config = structuredClone(profile.configuration),
      changes: string[] = [];
    for (const row of config.services) {
      if (Number(row[2]) === 45) {
        row[2] = 60;
        changes.push(`${row[0]}: 45 → 60 minutes`);
      }
      if (!validDuration(Number(row[2]), 30))
        issues.push(
          `Service ${row[0]} is incompatible with a 30-minute interval`,
        );
    }
    for (const [key, value] of [
      ["slot_granularity", 30],
      ["buffer_min", 0],
      ["lead_hours", 0],
    ] as const) {
      const row = config.settings.find((r) => r[0] === key);
      if (row) row[1] = value;
      else config.settings.push([key, value]);
    }
    if (!config.hours.length)
      config.hours = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ].map((day) => [
        day,
        "10:00",
        "19:00",
        "",
        "",
        day === "Sunday" ? "TRUE" : "FALSE",
        "",
      ]);
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          serviceChanges: changes,
          interval: 30,
          buffer: 0,
          leadHours: 0,
          bookingIntervalsToBackfill: proposals.length,
          existingHours:
            "preserved; doctor hours are constrained by clinic hours",
          issues,
        },
        null,
        2,
      ),
    );
    if (issues.length)
      throw new Error("Migration blocked. Resolve the reported records first.");
    if (!apply) return;
    const active = await (
      await collection<{ _id: string; until: Date }>("execution_leases")
    ).countDocuments({
      _id: { $ne: `clinic-settings:${sheetId}` },
      until: { $gt: new Date() },
    });
    if (active)
      throw new Error(
        "An operation is running. Retry migration when the clinic is idle.",
      );
    const backupId = `${sheetId}:availability-v2`;
    await (
      await collection<{
        _id: string;
        data: ReturnType<typeof encrypt>;
        createdAt: Date;
        expiresAt: Date;
      }>("migration_backups")
    ).updateOne(
      { _id: backupId },
      {
        $setOnInsert: {
          data: encrypt(
            JSON.stringify({ profile, rows, privateRecords }),
            `migration:${backupId}`,
          ),
          createdAt: new Date(),
          expiresAt: retentionDate(),
        },
      },
      { upsert: true },
    );
    await profiles.updateOne(
      { _id: sheetId },
      { $set: { state: "migrating" } },
    );
    const [fresh] = await sheetValues(sheetId, ["Appointments!A:N"]);
    if (digest(JSON.stringify(fresh)) !== digest(JSON.stringify(rows)))
      throw new Error(
        "Sheet changed during migration. Retry from the recovery snapshot.",
      );
    for (const proposal of proposals)
      await (
        await collection<PrivateBooking>("booking_private")
      ).updateOne({ _id: proposal.id }, { $set: { data: proposal.data } });
    const values: Row[] = rows.map((_, i) => [
      i === 0 ? "end_time" : proposals.find((p) => p.row === i)?.endTime || "",
    ]);
    const written = await googleRequest<{ updatedCells?: number }>(
      "sheets",
      `/spreadsheets/${sheetId}/values/Appointments!N1:N${rows.length}?valueInputOption=RAW`,
      { method: "PUT", body: { values } },
    );
    if (written.updatedCells !== values.length)
      throw new Error("Sheet update not confirmed; rerun to recover.");
    const [verified] = await sheetValues(sheetId, ["Appointments!A:N"]);
    if (
      verified.some(
        (r, i) =>
          JSON.stringify(r.slice(0, 13)) !==
          JSON.stringify(rows[i]?.slice(0, 13)),
      )
    )
      throw new Error("Sheet rows moved. Reconcile before activating.");
    await profiles.updateOne(
      { _id: sheetId },
      {
        $set: {
          configuration: config,
          state: "active",
          availabilityVersion: 2,
          updatedAt: new Date(),
        },
      },
    );
    await (
      await collection<{ _id: string; schemaVersion: number }>("app_settings")
    ).updateOne({ _id: "clinic" }, { $set: { schemaVersion: 3 } });
    await (await collection("clinic_cache")).deleteMany({});
    console.log(
      "Migration verified and activated. Existing Calendar events and booked durations were preserved.",
    );
  });
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Migration failed");
    process.exit(1);
  });
