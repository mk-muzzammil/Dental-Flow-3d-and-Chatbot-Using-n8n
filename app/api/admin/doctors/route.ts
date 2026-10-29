import { adminApi } from "@/lib/server/admin-api";
import { readJson } from "@/lib/server/http";
import {
  doctorEditorData,
  saveDoctor,
  checkDoctorCalendar,
  resumeDoctorSave,
} from "@/lib/server/storage/doctor-editor";
export const runtime = "nodejs";
export function GET(request: Request) {
  return adminApi(request, false, doctorEditorData);
}
export function PATCH(request: Request) {
  return adminApi(request, true, async () =>
    saveDoctor(await readJson(request, 12000)),
  );
}
export function POST(request: Request) {
  return adminApi(request, true, async () => {
    const input = await readJson(request, 2000);
    return input.action === "resume"
      ? resumeDoctorSave()
      : checkDoctorCalendar(input.calendarId);
  });
}
