import { NextResponse, type NextRequest } from "next/server";
import {
  authorizedBooking,
  rescheduleSlots,
  rescheduleBooking,
  pendingReschedule,
} from "@/lib/server/dental/reschedule";
import { readJson } from "@/lib/server/http";
import { safeError, appMode } from "@/lib/server/config";
import { readContact } from "@/lib/appointments";
export const runtime = "nodejs";
export const maxDuration = 180;
const hits = new Map<string, { at: number; count: number }>();
export async function POST(request: NextRequest) {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local",
    now = Date.now(),
    hit = hits.get(ip);
  if (hit && now - hit.at < 60000 && hit.count >= 20)
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  hits.set(ip, {
    at: hit && now - hit.at < 60000 ? hit.at : now,
    count: hit && now - hit.at < 60000 ? hit.count + 1 : 1,
  });
  if (hits.size > 5000) hits.clear();
  try {
    if (appMode() === "demo")
      return NextResponse.json(
        { error: "Rescheduling is available for live bookings." },
        { status: 400 },
      );
    const input = await readJson(request, 6000),
      raw = input.contact as { phone?: string; email?: string } | undefined,
      contact = readContact(`${raw?.phone || ""} ${raw?.email || ""}`);
    if (!contact)
      return NextResponse.json({ error: "invalid-contact" }, { status: 400 });
    const reference = String(input.reference || ""),
      b = await authorizedBooking(reference, contact);
    if (input.action === "resume")
      return NextResponse.json(
        await pendingReschedule(reference, contact, true),
      );
    if (input.action === "slots")
      return NextResponse.json({
        ...(await rescheduleSlots(
          b,
          input.mode === "day" ? String(input.date) : undefined,
        )),
        ...(await pendingReschedule(reference, contact)),
      });
    const key = request.headers.get("Idempotency-Key") || "";
    if (!/^[\w-]{16,100}$/.test(key))
      return NextResponse.json(
        { error: "invalid-idempotency-key" },
        { status: 400 },
      );
    return NextResponse.json(
      await rescheduleBooking(
        reference,
        contact,
        {
          date: String(input.date),
          time: String(input.time),
          version: String(input.version),
        },
        key,
      ),
    );
  } catch (error) {
    const d = safeError(error);
    return NextResponse.json({ error: d.code }, { status: d.status });
  }
}
