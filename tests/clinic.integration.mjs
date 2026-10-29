// Uses a temporary MongoDB database and mocked Google endpoints; never writes live Google resources.
import assert from "node:assert/strict";
import { mock } from "node:test";
import env from "@next/env";
env.loadEnvConfig(process.cwd());
process.env.APP_MODE = "live";
process.env.MONGODB_DB = "dfverify_" + Date.now();
// Pin the application clock to a future Wednesday morning so the suite works
// even on Sunday after closing. Keep TTL records ahead of the real DB clock.
const fixedNow = new Date();
fixedNow.setUTCDate(fixedNow.getUTCDate() + ((3 - fixedNow.getUTCDay() + 7) % 7) + 7);
fixedNow.setUTCHours(4, 0, 0, 0);
mock.timers.enable({ apis: ["Date"], now: fixedNow });
const mod = async (p) => {
  const m = await import(p);
  return m.default || m;
};
const db = await mod("../lib/server/db/index.ts"),
  sec = await mod("../lib/server/security.ts");
const profile = await mod("../lib/server/storage/profile.ts"),
  ws = await mod("../lib/server/storage/worksheets.ts");
const ap = await mod("../lib/server/dental/appointments.ts"),
  book = await mod("../lib/server/dental/book.ts"),
  act = await mod("../lib/server/dental/actions.ts"),
  clinic = await mod("../lib/server/dental/clinic.ts");
const fs = await import("node:fs/promises");
const schema = JSON.parse(
  await fs.readFile("lib/server/storage/schema.json", "utf8"),
);
const sid = "synthetic-clean-sheet",
  cal = "synthetic-calendar";
const events = new Map();
const sheets = {
  Appointments: [schema.Appointments],
  Patients: [schema.Patients],
  Doctors: [
    schema.Doctors,
    [
      "doctor-test",
      "Test Dentist",
      "all",
      true,
      "general",
      "General dentistry",
    ],
  ],
};
let sent = 0,
  failEmail = false,
  failDoctorWrite = false, failAppointmentWrite=false;
const response = (v, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(v), { status });
const rangeRead = (range) => {
  const [name, bounds] = range.replaceAll("'", "").split("!");
  const rows = sheets[name];
  if (!rows) throw new Error("Unexpected sheet " + name);
  const [start, end] = bounds.split(":");
  const column = (s) => {
    let n = 0;
    for (const c of s.match(/[A-Z]+/)[0]) n = n * 26 + c.charCodeAt(0) - 64;
    return n - 1;
  };
  return rows
    .slice(
      Number(start.match(/\d+/)?.[0] || 1) - 1,
      end?.match(/\d+/) ? Number(end.match(/\d+/)[0]) : undefined,
    )
    .map((r) =>
      r.slice(column(start), end ? column(end) + 1 : column(start) + 1),
    );
};
globalThis.fetch = async (input, options = {}) => {
  const u = new URL(String(input)),
    method = options.method || "GET",
    body = options.body ? JSON.parse(options.body) : undefined;
  if (u.host === "sheets.googleapis.com") {
    if (u.pathname.endsWith("values:batchGet"))
      return response({
        valueRanges: u.searchParams
          .getAll("ranges")
          .map((r) => ({ values: rangeRead(r) })),
      });
    const range = decodeURIComponent(u.pathname.split("/values/")[1] || "");
    if (range.endsWith(":append")) {
      const name = range.split("!")[0];
      if (["Appointments", "Patients"].includes(name)) throw new Error("Unsafe logical-table append used");
      sheets[name].push(body.values[0]);
      return response({ updates: { updatedRows: 1 } });
    }
    if (method === "PUT") {
      const [name, cell] = range.split("!");
      if (name === "Appointments" && failAppointmentWrite)return response({},500);
      if (name === "Doctors" && failDoctorWrite) return response({}, 500);
      const c = cell.charCodeAt(0) - 65,
        r = Number(cell.match(/\d+/)[0]) - 1;
      sheets[name][r] ||= [];
      body.values[0].forEach((v, i) => (sheets[name][r][c + i] = v));
      return response({ updatedCells: body.values[0].length });
    }
  }
  if (
    u.host === "www.googleapis.com" &&
    u.pathname.startsWith("/calendar/v3/")
  ) {
    if (u.pathname.endsWith("/freeBusy"))
      return response({ calendars: Object.fromEntries(body.items.map(item=>[item.id,{busy:[]}])) });
    const id = u.pathname.split("/events/")[1];
    if (method === "POST") {
      const event = {
        ...body,
        created: new Date().toISOString(),
        status: "confirmed",
      };
      events.set(event.id, event);
      return response(event);
    }
    if (method === "PATCH") {
      const event = { ...events.get(id), ...body };
      events.set(id, event);
      return response(event);
    }
    if (method === "DELETE") {
      events.delete(id);
      return response(null, 204);
    }
    if (id) return response(events.get(id) || {}, events.has(id) ? 200 : 404);
    const filters = u.searchParams.getAll("privateExtendedProperty");
    return response({
      items: [...events.values()].filter((e) =>
        filters.every((f) => {
          const [k, v] = f.split("=");
          return e.extendedProperties?.private?.[k] === v;
        }),
      ),
    });
  }
  if (u.host === "gmail.googleapis.com") {
    if (failEmail) return response({}, 500);
    sent++;
    return response({ id: "synthetic-" + sent });
  }
  throw new Error("Real network request prohibited in test: " + u.host);
};
try {
  await (
    await db.collection("google_connections")
  ).insertOne({
    _id: "owner",
    status: "connected",
    email: "owner@example.invalid",
    scopes: [],
    accessToken: sec.encrypt("synthetic-token", "google-access"),
    expiresAt: new Date(Date.now() + 3600000),
  });
  await (
    await db.collection("app_settings")
  ).insertOne({
    _id: "clinic",
    sheetId: sid,
    calendarId: cal,
    schemaVersion: 2,
  });
  const config = {
    services: [["checkup", "Checkup", 30, 1500, true, "", "", "general"]],
    hours: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ].map((d) => [d, "10:00", "20:00", "", "", false, ""]),
    settings: [
      ["timezone", "Asia/Karachi"],
      ["lead_hours", 2],
      ["buffer_min", 10],
    ],
    holidays: [],
    faq: [["parking", "Parking?", "Parking available", "", "", true]],
    specializations: [["general", "General dentistry", "", "", true]],
  };
  await (
    await db.collection("clinic_configuration")
  ).insertOne({
    _id: sid,
    state: "active",
    version: 2,
    configuration: config,
    doctorConnections: profile.encryptDoctorConnections(sid, {
      "doctor-test": { calendarId: cal, email: "" },
    }),
    updatedAt: new Date(),
  });
  sheets.Appointments.push(['', 'misaligned-id', 'DN-MISALIGNED']);
  await assert.rejects(() => ws.cleanBookingRows(sid), e => e.code === 'misaligned_sheet_row_repair_required');
  sheets.Appointments.pop();
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const input = {
    name: "Synthetic Storage Patient",
    phone: "03000000099",
    email: "patient@example.invalid",
    service: "checkup",
    doctor: "doctor-test",
    date,
    time: "14:00",
    notes: "Private synthetic note",
  };
  const created = await book.createBooking(input, "synthetic-key");
  assert.equal(created.ok, true);
  assert.equal(created.emailCopy, true);
  assert.equal(sheets.Patients.length, 2);
  assert.equal(sheets.Appointments.length, 2);
  assert.equal(events.size, 1);
  assert.deepEqual(await book.createBooking(input, "synthetic-key"), created);
  assert.equal(sheets.Appointments.length, 2);
  assert.equal(
    (await ap.listAppointments({ phone: input.phone })).appointments.length,
    1,
  );
  assert.equal(
    (await ap.listAppointments({ email: input.email.toUpperCase() }))
      .appointments.length,
    1,
  );
  const saved = (await ap.appointments())[0].booking;
  assert.equal(saved.notes, input.notes);
  assert.equal(saved.date, date);
  assert.equal(saved.time, input.time);
  const publicText = JSON.stringify(sheets);
  assert(!publicText.includes(saved.token));
  assert(!publicText.includes(saved.eventId));
  assert(!publicText.includes(cal));
  assert(!publicText.includes(input.notes));
  assert(!JSON.stringify(sheets.Appointments).includes(input.phone));
  assert(
    (await clinic.clinicInfo("prompt", "en")).promptBlock.includes(
      "Parking available",
    ),
  );
  assert(
    (await clinic.slots({ service: "checkup", mode: "day", date })).slots
      .length > 0,
  );
  const moving = await mod("../lib/server/dental/reschedule.ts");
  const currentBooking = (await ap.appointments())[0].booking;
  const offered = await moving.rescheduleSlots(currentBooking, date);
  const impact=await mod('../lib/server/dental/settings-impact.ts');
  const closed={...config,hours:config.hours.map(r=>[...r.slice(0,5),'TRUE',r[6]])};
  assert((await impact.settingsImpact(closed)).warnings.some(w=>w.reference===created.reference));
  failAppointmentWrite=true;
  await assert.rejects(()=>moving.rescheduleBooking(created.reference,{phone:input.phone},{date,time:'16:00',version:offered.version},'synthetic-reschedule'));
  await assert.rejects(()=>act.cancelBooking(created.reference,{contact:{phone:input.phone}}),e=>e.code==='booking-update-pending');
  failAppointmentWrite=false;
  const move = await moving.rescheduleBooking(
    created.reference,
    { phone: input.phone },
    { date, time: "16:00", version: offered.version },
    "synthetic-reschedule",
  );
  assert.equal(move.time, "16:00");
  assert.equal(events.size, 1);
  assert.equal((await ap.appointments())[0].booking.time, "16:00");
  const freed = await clinic.slots({ service: "checkup", mode: "day", date });
  assert(freed.slots.includes("14:00"));
  assert(!freed.slots.includes("16:00"));
  const cancelled = await act.cancelBooking(created.reference, {
    contact: { phone: input.phone },
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(events.size, 0);
  assert.equal(sheets.Appointments[1][3], "CANCELLED");
  assert.equal(
    (await ap.listAppointments({ phone: input.phone })).appointments.length,
    0,
  );
  assert.equal(sent, 3);
  failEmail = true;
  const second = await book.createBooking(
    { ...input, time: "15:00" },
    "synthetic-second",
  );
  assert.equal(second.ok, true);
  assert.equal(second.emailCopy, false);
  assert.equal(sheets.Patients.length, 2);
  assert.equal(sheets.Appointments[2][3], "CONFIRMED");
  const hidden = await (
    await db.collection("booking_private")
  ).findOne({ _id: sid + ":" + sheets.Appointments[2][0] });
  const purpose = "booking-private:" + hidden._id;
  const fields = JSON.parse(sec.decrypt(hidden.data, purpose));
  fields.expiresAt = new Date(Date.now() - 60000).toISOString();
  await (
    await db.collection("booking_private")
  ).updateOne(
    { _id: hidden._id },
    { $set: { data: sec.encrypt(JSON.stringify(fields), purpose) } },
  );
  sheets.Appointments[2][3] = "PENDING";
  const pending = (await ap.appointments())[1].booking;
  assert.throws(
    () => act.actionGuard(pending, "confirm", "token"),
    (e) => e.code === "expired",
  );
  failEmail = false;
  await act.expireBooking(pending);
  assert.equal(sheets.Appointments[2][3], "EXPIRED");
  assert.equal(events.size, 0);

  const reservations = await mod("../lib/server/dental/reservations.ts");
  const contests = await Promise.allSettled(
    ["concurrent-a", "concurrent-b"].map((id) =>
      reservations.reserve("race-calendar", date, {
        id,
        start: 100000,
        end: 200000,
      }),
    ),
  );
  assert.equal(contests.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(contests.filter((r) => r.status === "rejected").length, 1);
  await reservations.reserve("race-calendar", date, {
    id: "back-to-back",
    start: 200000,
    end: 260000,
  });
  console.log(
    "PASS: rescheduling releases the original interval, same Calendar event is moved, and concurrent overlapping claims have one winner.",
  );
  const editor = await mod("../lib/server/storage/doctor-editor.ts");
  const validate = await mod("../lib/server/storage/editor-validation.ts");
  validate.validateEditorConfiguration(config, config);
  assert.throws(
    () =>
      validate.validateEditorConfiguration(
        { ...config, settings: [...config.settings, ["slot_granularity", 60]] },
        config,
      ),
    (e) => e.code === "service_duration_must_be_multiple_of_interval",
  );
  assert.throws(
    () =>
      validate.validateEditorConfiguration(
        { ...config, services: [["checkup", "Checkup", 0, 1500, true]] },
        config,
      ),
    (e) => e.code === "service_duration_must_be_multiple_of_interval",
  );
  const first = (await editor.doctorEditorData()).doctors[0];
  const update = {
    ...first,
    sheetId: sid,
    key: "doctor-edit-test-1",
    row: [first.row[0], "Updated Dentist", "all", "TRUE", "general", ""],
    connection: {
      calendarId: "new-synthetic-calendar",
      email: "staff@example.invalid",
    },
  };
  failDoctorWrite = true;
  await assert.rejects(() => editor.saveDoctor(update));
  assert.equal((await editor.doctorEditorData()).pending, true);
  await assert.rejects(
    () => clinic.readClinic(),
    (e) => e.code === "doctor_update_pending_retry_save",
  );
  failDoctorWrite = false, failAppointmentWrite=false;
  await editor.resumeDoctorSave();
  assert.equal((await editor.doctorEditorData()).pending, false);
  assert.equal(sheets.Doctors[1][1], "Updated Dentist");
  assert.equal(
    (await editor.doctorEditorData()).doctors[0].connection.calendarId,
    "new-synthetic-calendar",
  );
  assert(!JSON.stringify(sheets.Doctors).includes("new-synthetic-calendar"));
  assert(!JSON.stringify(sheets.Doctors).includes("staff@example.invalid"));
  await editor.saveDoctor(update); // response-loss retry returns recorded result
  await assert.rejects(
    () =>
      editor.saveDoctor({
        ...update,
        key: "doctor-edit-test-2",
        row: [...update.row],
      }),
    (e) => e.code === "doctor_changed_reload_before_saving",
  );
  const pub = await mod("../lib/server/storage/public-clinic.ts");
  const data = await pub.publicClinic();
  assert.equal(data.dentists[0].name, "Updated Dentist");
  assert.equal(data.services[0].price, 1500);
  assert(!JSON.stringify(data).includes("new-synthetic-calendar"));
  console.log(
    "PASS: doctor Sheet edits, encrypted private connections, partial-write recovery, stale-edit rejection, idempotency and sanitized public clinic data.",
  );
  const race=await Promise.allSettled(['booking-race-a','booking-race-b'].map(key=>book.createBooking({...input,time:'17:00'},key)));
  const winners=race.filter(r=>r.status==='fulfilled'&&r.value.ok===true);
  assert.equal(winners.length,1);assert.equal(events.size,1);
  await act.cancelBooking(winners[0].value.reference,{contact:{phone:input.phone}});assert.equal(events.size,0);
  console.log('PASS: concurrent booking requests produce one appointment; interrupted rescheduling resumes safely; admin conflicts are detected.');
  await (
    await db.collection("clinic_configuration")
  ).updateOne({ _id: sid }, { $set: { state: "migrating" } });
  await assert.rejects(
    () => ap.appointments(),
    (e) => e.code === "clinic_migration_in_progress",
  );
  console.log(
    "PASS: booking, lookup by phone/email, retries, patient deduplication, private-field exclusion, FAQ/slots, cancellation, email failure, expiry and migration guard. No real Google requests sent.",
  );
} finally {
  const database = await db.database();
  assert(database.databaseName.startsWith("dfverify_"));
  await database.dropDatabase();
}
process.exit();
