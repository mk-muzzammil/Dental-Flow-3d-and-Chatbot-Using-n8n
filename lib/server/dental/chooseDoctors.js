// Deterministic port of 01-slot-engine / Which Doctors.
import { DF } from './rules.js';
export function chooseDoctors(c, data) {
  const rows = (i) => data[i] || [];
  const set = DF.settings(rows(2));
  const docs = DF.doctors(rows(4), c.CALENDAR_ID, set.clinic_name || c.CLINIC_NAME);
  const svcs = DF.services(rows(0)).filter((s) => s.active);
  const pub = (d) => ({
    id: d.id,
    name: d.name,
    services: svcs.filter((s) => DF.doesService(d, s.id)).map((s) => s.id),
  });

  // The list of dentists, for the booking page and the website assistant.
  if (c.listOnly) {
    const list = c.service ? DF.eligible(docs, c.service, 'any') : docs;
    return { answerNow: true, response: { doctors: list.filter((d) => !d.implicit).map(pub) } };
  }

  const eligible = DF.eligible(docs, c.service, c.doctor);
  if (!eligible.length) {
    return {
      answerNow: true,
      response: {
        date: c.date,
        service: c.service,
        doctor: c.doctor,
        slots: [],
        byDoctor: [],
        doctors: [],
        reason: docs.some((d) => d.id === c.doctor) ? 'doctor-does-not-do-this' : 'no-doctor',
      },
    };
  }
  return { answerNow: false, eligible, freeBusyItems: eligible.map((d) => ({ id: d.calendarId })) };
}
