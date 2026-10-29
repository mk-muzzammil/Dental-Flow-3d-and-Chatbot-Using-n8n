import "server-only";
import { randomUUID } from "node:crypto";
import { settings } from "../google/settings";
import { googleRequest, freeBusy, type Row } from "../google/api";
import {
  storageProfile,
  doctorConnections,
  encryptDoctorConnections,
  type StorageProfile,
} from "./profile";
import { sheetValues, requireHeader, appendRaw } from "./worksheets";
import schema from "./schema.json";
import { digest, decrypt } from "../security";
import { collection } from "../db";
import { AppError } from "../config";
import { withLease } from "../operations/lease";
import { operate, type Operation } from "../operations/journal";
import { audit } from "../auth";
export async function doctorEditorData() {
  const { sheetId } = await settings();
  const profile = await storageProfile(sheetId);
  if (!profile) throw new AppError("clinic_not_migrated", 409);
  const [rows] = await sheetValues(sheetId, ["Doctors!A:F"]);
  requireHeader(rows, schema.Doctors);
  const connections = doctorConnections(profile);
  return {
    sheetId,
    pending: !!profile.pendingDoctorEdit,
    doctors: rows
      .slice(1)
      .filter((r) => r[0])
      .map((row) => ({
        row,
        connection: connections[String(row[0])] || {
          calendarId: "",
          email: "",
        },
        version: digest(
          JSON.stringify([row, connections[String(row[0])] || null]),
        ),
      })),
  };
}
export async function saveDoctor(input: Record<string, unknown>) {
  const key = String(input.key || "");
  if (!/^[\w-]{16,80}$/.test(key))
    throw new AppError("invalid_request_key", 400);
  const selected = await settings();
  if (input.sheetId !== selected.sheetId)
    throw new AppError("clinic_selection_changed", 409);
  const sheetId = selected.sheetId;
  const row = input.row as Row,
    connection = input.connection as { calendarId: string; email: string };
  if (
    !Array.isArray(row) ||
    row.length !== 6 ||
    row.some(
      (v) =>
        !["string", "boolean"].includes(typeof v) || String(v).length > 1000,
    ) ||
    !String(row[1]).trim() ||
    !connection ||
    typeof connection.calendarId !== "string" ||
    !connection.calendarId.trim() ||
    connection.calendarId.length > 254 ||
    /[\r\n]/.test(connection.calendarId) ||
    typeof connection.email !== "string" ||
    (connection.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(connection.email))
  )
    throw new AppError("invalid_doctor_details", 400);
  return withLease(`clinic-settings:${sheetId}`,()=>withLease(`doctor-editor:${sheetId}`, () =>
    operate(
      "doctor-edit",
      `${sheetId}:${key}`,
      digest(JSON.stringify(input)),
      async (journal) => {
        let context = journal.context<{
          row: Row;
          old?: Row;
          connection: typeof connection;
          input: Record<string, unknown>;
        }>();
        const profile = await storageProfile(sheetId);
        if (!profile) throw new AppError("clinic_not_migrated", 409);
        if (
          profile.pendingDoctorEdit &&
          profile.pendingDoctorEdit !== journal.id
        )
          throw new AppError("finish_previous_doctor_save_before_editing", 409);
        if (!context) {
          const current = await doctorEditorData();
          const existing = current.doctors.find((d) => d.row[0] === row[0]);
          if (row[0] && (!existing || input.version !== existing.version))
            throw new AppError("doctor_changed_reload_before_saving", 409);
          if (
            String(row[3]).toUpperCase() === "FALSE" &&
            !current.doctors.some(
              (d) =>
                d.row[0] !== row[0] &&
                String(d.row[3]).toUpperCase() !== "FALSE",
            )
          )
            throw new AppError("keep_at_least_one_active_doctor", 400);
          const ids = String(row[4])
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (
            ids.some(
              (id) =>
                !profile.configuration.specializations.some((s) => s[0] === id),
            )
          )
            throw new AppError("unknown_specialization", 400);
          const serviceIds = String(row[2])
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (
            serviceIds.some(
              (id) =>
                id !== "all" &&
                !profile.configuration.services.some((s) => s[0] === id),
            )
          )
            throw new AppError("unknown_service", 400);
          const next: Row = [
            row[0] || `dr-${randomUUID().slice(0, 12)}`,
            String(row[1]).trim(),
            row[2] || "all",
            String(row[3]).toUpperCase() === "FALSE" ? "FALSE" : "TRUE",
            ids.join(","),
            ids
              .map(
                (id) =>
                  profile.configuration.specializations.find(
                    (s) => s[0] === id,
                  )?.[1],
              )
              .join(", ") || "Not specified",
          ];
          context = { row: next, old: existing?.row, connection, input };
          await journal.saveContext(context);
        }
        const desired = context;
        await journal.step("connection", async () => {
          const latest = await storageProfile(sheetId);
          if (!latest) throw new AppError("clinic_not_migrated", 409);
          await (
            await collection<StorageProfile>("clinic_configuration")
          ).updateOne(
            { _id: sheetId, state: "active" },
            {
              $set: {
                doctorConnections: encryptDoctorConnections(sheetId, {
                  ...doctorConnections(latest),
                  [String(desired.row[0])]: desired.connection,
                }),
                pendingDoctorEdit: journal.id,
                updatedAt: new Date(),
              },
            },
          );
        });
        await journal.step("worksheet", async () => {
          const [rows] = await sheetValues(sheetId, ["Doctors!A:F"]);
          requireHeader(rows, schema.Doctors);
          const index = rows.findIndex((r) => r[0] === desired.row[0]);
          if (
            index >= 0 &&
            JSON.stringify(rows[index]) === JSON.stringify(desired.row)
          )
            return;
          if (
            index >= 0 &&
            JSON.stringify(rows[index]) !== JSON.stringify(desired.old)
          )
            throw new AppError("doctor_sheet_changed_during_save", 409);
          if (index < 0) await appendRaw(sheetId, 'Doctors!A:F', desired.row);
          else await googleRequest('sheets', `/spreadsheets/${sheetId}/values/${encodeURIComponent(`Doctors!A${index + 1}:F${index + 1}`)}?valueInputOption=RAW`, {
            method: 'PUT', body: { values: [desired.row] },
          });
          const [check] = await sheetValues(sheetId, ["Doctors!A:F"]);
          if (
            !check.some(
              (r) => JSON.stringify(r) === JSON.stringify(desired.row),
            )
          )
            throw new AppError("doctor_sheet_write_unconfirmed");
        });
        await (
          await collection<StorageProfile>("clinic_configuration")
        ).updateOne(
          { _id: sheetId, pendingDoctorEdit: journal.id },
          { $unset: { pendingDoctorEdit: "" } },
        );
        await (await collection("clinic_cache")).deleteMany({});
        await audit("doctor_updated");
        return { ok: true };
      },
    ),
  ));
}
export async function checkDoctorCalendar(calendarId: unknown) {
  if (
    typeof calendarId !== "string" ||
    !calendarId.trim() ||
    calendarId.length > 254
  )
    throw new AppError("invalid_calendar_id", 400);
  const result = await freeBusy({
    timeMin: new Date().toISOString(),
    timeMax: new Date(Date.now() + 3600000).toISOString(),
    items: [{ id: calendarId }],
  });
  const calendar = result.calendars?.[calendarId];
  if (!calendar || calendar.errors?.length)
    throw new AppError("calendar_access_failed", 400);
  return {
    ok: true,
    detail:
      "Availability access verified. Event-write access is verified by a controlled test booking.",
  };
}

export async function resumeDoctorSave() {
  const selected = await settings(),
    profile = await storageProfile(selected.sheetId);
  if (!profile?.pendingDoctorEdit) return { ok: true };
  const op = await (
    await collection<Operation>("operation_journal")
  ).findOne({ _id: profile.pendingDoctorEdit });
  if (!op?.context) throw new AppError("doctor_recovery_record_missing");
  const context = JSON.parse(decrypt(op.context, `context:${op._id}`));
  return saveDoctor(context.input);
}
