import { clinicDate, localInstant } from "@/lib/availability";
import { calculateDay, openingFor } from "./availability";
// The same engine supplies displayed slots and validates confirmation requests.
export function checkAvailability(v, data, w, fb) {
  const result = calculateDay(data, w.eligible, fb, v.service, v.date);
  const option = result.options.find(
    (o) =>
      o.time === v.time &&
      (v.doctor === "any" || !v.doctor || o.doctor === v.doctor),
  );
  const doctor = w.eligible.find((d) => d.id === option?.doctor);
  const settings = Object.fromEntries(data[2].map((r) => [String(r[0]), r[1]]));
  const expiresAt = new Date(
    Date.now() + Number(settings.hold_minutes || 30) * 60000,
  ).toISOString();
  let reason =
    v.version && v.version !== result.version
      ? "configuration-changed"
      : option
        ? "ok"
        : result.reason || "slot-taken";
  if (!option && !result.reason) {
    const minute = Number(v.time.slice(0, 2)) * 60 + Number(v.time.slice(3)),
      interval = Number(settings.slot_granularity || 30);
    if (
      v.date === clinicDate(Date.now(), result.timezone) &&
      localInstant(v.date, v.time, result.timezone) <= Date.now()
    )
      reason = "past";
    else if (minute % interval) reason = "off-grid";
    else if (
      !w.eligible.some((d) => {
        const h = openingFor(data[1], d.id, v.date);
        return (
          h &&
          v.time >= h.open &&
          minute + result.durationMin <=
            Number(h.close.slice(0, 2)) * 60 + Number(h.close.slice(3))
        );
      })
    )
      reason = "outside-hours";
  }
  return {
    ...v,
    free: reason === "ok",
    reason,
    timezone: result.timezone,
    holdMinutes: Number(settings.hold_minutes || 30),
    doctorId: doctor?.id || "",
    doctorName: doctor?.name || "",
    calendarId: doctor?.calendarId || "",
    serviceName: result.serviceName,
    price: result.price,
    durationMin: result.durationMin,
    expiresAt,
    startsAt: option?.startsAt || "",
    endsAt: option?.endsAt || "",
    endTime: option?.endTime || "",
    prettyDate: v.date,
    prettyTime: v.time,
    event:
      option && doctor
        ? {
            summary: `[PENDING] ${v.name} — ${result.serviceName}`,
            description: `Reference: ${v.ref}\nPatient: ${v.name}\nPhone: ${v.phone}\nEmail: ${v.email}\nDentist: ${doctor.name}`,
            start: { dateTime: option.startsAt, timeZone: result.timezone },
            end: { dateTime: option.endsAt, timeZone: result.timezone },
            colorId: "6",
            extendedProperties: {
              private: {
                ref: v.ref,
                token: v.token,
                status: "PENDING",
                expiresAt,
                doctor: doctor.id,
                serviceId: v.service,
              },
            },
          }
        : null,
  };
}
