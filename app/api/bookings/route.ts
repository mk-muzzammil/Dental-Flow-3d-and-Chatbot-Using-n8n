import { NextResponse, type NextRequest } from "next/server";
import { createBooking, validateBooking } from "@/lib/server/dental/book";
import { appMode, deadline, safeError } from "@/lib/server/config";
import { readJson } from "@/lib/server/http";
import { demoSlots } from "@/lib/server/dental/demo-slots";
export const runtime = "nodejs";
export const maxDuration = 180;
const hits = new Map<string, number[]>();
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local",
    now = Date.now(),
    recent = (hits.get(ip) || []).filter((t) => t > now - 60000);
  if (recent.length >= 12)
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  hits.set(ip, [...recent, now]);
  if (hits.size > 5000) hits.clear();
  try {
    const key = request.headers.get("Idempotency-Key") || "";
    if (!/^[\w-]{16,100}$/.test(key))
      return NextResponse.json(
        { error: "invalid-idempotency-key" },
        { status: 400 },
      );
    const input = await readJson(request, 6000);
    if (typeof input.version !== "string" || !input.version)
      return NextResponse.json(
        { error: "configuration-changed" },
        { status: 409 },
      );
    if (appMode() === "demo") {
      const b = validateBooking(input),
        a = demoSlots(b.service, b.date, b.doctor),
        option = a.options.find((o) => o.time === b.time);
      if (!option)
        return NextResponse.json({ error: "slot-taken" }, { status: 409 });
      return NextResponse.json({
        ok: true,
        demo: true,
        reference: "DEMO",
        service: a.serviceName,
        dentist: option.doctorName,
        when: `${b.date} ${b.time}–${option.endTime}`,
        emailCopy: false,
        whatsappSent: false,
        ...option,
      });
    }
    const result = await createBooking(
      input,
      key,
      deadline(170000, request.signal),
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    const detail = safeError(error);
    return NextResponse.json(
      { ok: false, error: detail.code },
      { status: detail.status },
    );
  }
}
