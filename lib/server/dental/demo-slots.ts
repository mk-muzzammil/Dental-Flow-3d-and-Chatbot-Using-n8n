import { services, dentists } from "@/content/clinic";
import { availableTimes, currentWeek, weekday } from "@/lib/availability";
export function demoSlots(service: string, date?: string, doctor = "any") {
  const timezone = "Asia/Karachi",
    now = Date.now(),
    week = currentWeek(now, timezone),
    svc = services.find((s) => s.id === service),
    duration = svc?.minutes === 45 ? 60 : svc?.minutes || 30;
  const pool = dentists.filter((d) => doctor === "any" || d.id === doctor);
  const days = week.map((day) => {
    const options =
      !svc || !pool.length
        ? []
        : availableTimes({
            date: day,
            timezone,
            duration,
            interval: 30,
            opening:
              weekday(day) === "Sunday"
                ? null
                : { open: "10:00", close: "19:00" },
            busy: [],
            now,
          }).map((t) => ({
            ...t,
            date: day,
            doctor: pool[0].id,
            doctorName: pool[0].name,
          }));
    return {
      date: day,
      options,
      available: !!options.length,
      count: options.length,
      reason: options.length
        ? undefined
        : weekday(day) === "Sunday"
          ? "closed"
          : "past",
    };
  });
  return {
    timezone,
    version: "demo",
    durationMin: duration,
    serviceName: svc?.name.en || "",
    days: days.map(({ options, ...d }) => d),
    options: date
      ? days.find((d) => d.date === date)?.options || []
      : days.flatMap((d) => d.options),
    reason: date
      ? days.find((d) => d.date === date)?.reason
      : days.some((d) => d.available)
        ? undefined
        : "nothing-free-this-week",
  };
}
