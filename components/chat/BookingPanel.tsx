"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useClinic } from "@/components/ClinicProvider";
import type { Dict, Lang } from "@/lib/i18n";
import type { Booking } from "@/lib/chat-types";
import { clock, dayTitle } from "@/lib/slots";
import {
  bookingWeekStart,
  slotError,
  type AvailabilityAnswer,
  type TimeOption,
} from "@/lib/booking-flow";
export type PanelStart = {
  service?: string;
  dentist?: string;
  reschedule?: {
    reference: string;
    contact: { phone?: string; email?: string };
  };
};
export type BookingRequest = {
  serviceId: string;
  serviceName: string;
  dentistId: string;
  dentistName: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
};
export function BookingPanel({
  lang,
  t,
  start,
  onClose,
  onConfirm,
}: {
  lang: Lang;
  t: Dict["chat"];
  minWord: string;
  start: PanelStart;
  onClose: () => void;
  onConfirm: (
    request: BookingRequest,
    result: Booking & { demo?: boolean; endTime?: string; minutes?: number },
  ) => void;
}) {
  const { services } = useClinic(),
    ur = lang === "ur";
  const [service, setService] = useState(start.service || ""),
    [step, setStep] = useState<"service" | "day" | "time" | "confirmation">(
      start.service ? "day" : "service",
    );
  const [week, setWeek] = useState<AvailabilityAnswer | null>(null),
    [day, setDay] = useState(""),
    [times, setTimes] = useState<AvailabilityAnswer | null>(null),
    [pick, setPick] = useState<TimeOption | null>(null);
  const [error, setError] = useState(""),
    [weekUpdated, setWeekUpdated] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [form, setForm] = useState({ name: "", phone: "", email: "" });
  const key = useRef(""),
    svc = services.find((s) => s.id === service),
    button =
      "min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink transition-colors enabled:hover:border-brand enabled:hover:bg-sky focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-mist disabled:text-muted";
  const tile = button + " flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-start";
  const words = {
    day: ur ? "دن منتخب کریں" : "Choose a day",
    time: ur ? "وقت منتخب کریں" : "Choose a time",
    confirmation: ur ? "تفصیلات اور تصدیق" : "Review and confirm",
    past: ur ? "گزر گیا" : "Past",
    closed: ur ? "بند" : "Closed",
    full: ur ? "بک ہے" : "Full",
    unavailable: ur ? "نامعلوم" : "Unavailable",
    back: ur ? "واپس" : "Back",
    empty: ur
      ? "اس دن کوئی وقت دستیاب نہیں۔ دوسرا دن منتخب کریں۔"
      : "No times are available for this day. Please choose another day.",
  };
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("df-details") || "null");
      if (saved)
        setForm({
          name: String(saved.name || ""),
          phone: String(saved.phone || ""),
          email: String(saved.email || ""),
        });
    } catch {}
  }, []);
  useEffect(() => {
    if (!service || !["day", "time"].includes(step)) return;
    const controller = new AbortController();
    setLoading(true);
    const mode = step === "day" ? "week" : "day";
    const query = new URLSearchParams({
      mode,
      service,
      doctor: start.dentist || "any",
      lang,
      ...(mode === "day" ? { date: day } : {}),
    });
    const url = start.reschedule
      ? "/api/appointments/reschedule"
      : `/api/slots?${query}`;
    fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      ...(start.reschedule
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...start.reschedule,
              action: "slots",
              mode,
              date: day,
            }),
          }
        : {}),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || data.reason || "unavailable");
        return data as AvailabilityAnswer;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          if (mode === "week") setWeek(data);
          else setTimes(data);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [service, step, day, start.dentist, start.reschedule, lang, refresh]);
  useEffect(() => {
    const firstDay = week?.days?.[0]?.date;
    if (!firstDay || !week || step === "service") return;
    const updateWeek = () => {
      // Keep an in-flight/uncertain request's key so a retry can recover it.
      if (document.hidden || busy || key.current) return;
      if (bookingWeekStart(Date.now(), week.timezone) === firstDay) return;
      setWeek(null);
      setDay("");
      setTimes(null);
      setPick(null);
      setError("");
      setWeekUpdated(true);
      setStep("day");
      setRefresh((n) => n + 1);
    };
    updateWeek();
    const timer = window.setInterval(updateWeek, 30_000);
    window.addEventListener("focus", updateWeek);
    document.addEventListener("visibilitychange", updateWeek);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateWeek);
      document.removeEventListener("visibilitychange", updateWeek);
    };
  }, [week, step, busy]);
  const back = () => {
    setError("");
    key.current = "";
    if (step === "confirmation") setStep("time");
    else if (step === "time") setStep("day");
    else if (step === "day" && !start.reschedule) setStep("service");
    else onClose();
  };
  const submit = async () => {
    if (!svc || !pick || !times) return;
    key.current ||= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        start.reschedule ? "/api/appointments/reschedule" : "/api/bookings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key.current,
          },
          body: JSON.stringify(
            start.reschedule
              ? {
                  ...start.reschedule,
                  action: "confirm",
                  date: pick.date,
                  time: pick.time,
                  version: times.version,
                }
              : {
                  ...form,
                  service,
                  date: pick.date,
                  time: pick.time,
                  doctor: pick.doctor,
                  language: lang,
                  version: times.version,
                },
          ),
          signal: AbortSignal.timeout(175000),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.ok) {
        const code = result.error || result.reason || "unavailable";
        setError(code);
        if (
          response.status === 409 &&
          ["slot-taken", "configuration-changed", "past", "outside-current-week", "closed", "fully-booked", "off-grid", "outside-hours"].includes(code)
        ) {
          key.current = "";
          setPick(null);
          setTimes(null);
          setStep("time");
          setRefresh((n) => n + 1);
        }
        return;
      }
      if (!start.reschedule) {
        try { sessionStorage.setItem("df-details", JSON.stringify(form)); } catch {}
      }
      onConfirm(
        {
          serviceId: service,
          serviceName: svc.name.en,
          dentistId: pick.doctor,
          dentistName: pick.doctorName,
          date: pick.date,
          time: pick.time,
          ...form,
        },
        result,
      );
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      className="absolute inset-x-0 bottom-0 top-3 z-20 flex flex-col overflow-hidden rounded-t-3xl bg-mist shadow-xl ring-1 ring-line"
      role="dialog"
      aria-label={t.panelTitle}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-white p-3">
        <button
          type="button"
          className={button + " shrink-0"}
          onClick={back}
          disabled={busy}
          aria-label={t.back}
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-brand">{t.panelTitle}</p>
          <h3 className="text-sm font-semibold text-ink">
            {step === "service" ? t.stepTreatment : words[step]}
          </h3>
        </div>
        <button
          className={button}
          onClick={onClose}
          disabled={busy}
          aria-label={t.close}
        >
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3">
        {weekUpdated && (
          <p role="status" className="rounded-xl border border-line bg-sky p-3 text-sm text-brand">
            {ur ? "نیا ہفتہ شروع ہو گیا ہے۔ تازہ دستیاب دن اور وقت منتخب کریں۔" : "A new week has started. Please choose from the updated days and times."}
          </p>
        )}
        {svc && step !== "service" && (
          <p className="text-sm font-semibold text-ink">
            {svc.name[lang]}{" "}
            <span className="font-normal text-muted">
              · {times?.durationMin || week?.durationMin || svc.minutes}{" "}
              {ur ? "منٹ" : "min"}
            </span>
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900"
          >
            {slotError(error, ur)}{" "}
            <button
              className="min-h-11 underline"
              onClick={() => {
                if (step === "confirmation") { void submit(); return; }
                setError("");
                setRefresh((n) => n + 1);
              }}
            >
              {t.retry}
            </button>
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm text-muted">
            {t.loading}
          </p>
        )}
        {step === "service" && (
          <div className="grid gap-2">
            {services.map((s) => (
              <button
                className={button + " text-start"}
                key={s.id}
                onClick={() => {
                  setService(s.id);
                  setWeek(null);
                  setTimes(null);
                  setStep("day");
                  setError("");
                }}
              >
                {s.name[lang]}
              </button>
            ))}
          </div>
        )}
        {(week?.pending || times?.pending) && start.reschedule && (
          <button
            disabled={busy}
            className={button + " w-full"}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await fetch("/api/appointments/reschedule", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...start.reschedule,
                    action: "resume",
                  }),
                });
                const result = await r.json();
                if (!r.ok || !result.ok) throw new Error(result.error || "unavailable");
                if (svc) onConfirm({ serviceId: service, serviceName: svc.name.en, dentistId: start.dentist || "any", dentistName: result.dentist, date: result.date, time: result.time, ...form }, result);
              } catch (e) {
                setError(e instanceof Error ? e.message : "unavailable");
              } finally {
                setBusy(false);
              }
            }}
          >
            {ur
              ? "نامکمل تبدیلی دوبارہ مکمل کریں"
              : "Resume interrupted time change"}
          </button>
        )}
        {step === "day" && week && !loading && (
          <>
            <p className="text-xs text-muted">
              {week.timezone} · {ur ? "اس ہفتے" : "This week"}
            </p>
            <div className="grid grid-cols-1 gap-2" aria-label={words.day}>
              {week.days?.map((d) => (
                <button
                  key={d.date}
                  className={tile}
                  disabled={!d.available}
                  onClick={() => {
                    setDay(d.date);
                    setTimes(null);
                    setStep("time");
                    setError("");
                  }}
                >
                  <span className="min-w-0 text-sm font-semibold">
                    {dayTitle(lang, d.date, true)}
                  </span>
                  <span className={"shrink-0 rounded-lg px-2 py-1 text-xs " + (d.available ? "bg-sky text-brand" : "bg-line/40 text-muted")}>
                    {d.available ? (ur ? "دستیاب" : "Available") : d.reason === "past"
                      ? words.past
                      : d.reason === "closed"
                        ? words.closed
                        : d.reason === "fully-booked"
                          ? words.full
                          : words.unavailable}
                  </span>
                </button>
              ))}
            </div>
            {!week.days?.some((d) => d.available) && (
              <p
                role="status"
                className="rounded-xl bg-white p-3 text-sm text-ink"
              >
                {slotError("nothing-free-this-week", ur)}
              </p>
            )}
          </>
        )}
        {step === "time" && times && !loading && (
          <>
            <p className="text-sm text-ink">{dayTitle(lang, day, true)}</p>
            {times.options.length ? (
              <div className="grid grid-cols-1 gap-2" aria-label={words.time}>
                {times.options.map((o) => (
                  <button
                    key={o.startsAt}
                    className={tile + " tabular-nums"}
                    aria-label={clock(lang, o.time)}
                    onClick={() => {
                      setPick(o);
                      key.current = "";
                      setStep("confirmation");
                      setError("");
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">{clock(lang, o.time)}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {ur ? "اختتام" : "Ends"} {clock(lang, o.endTime)}
                      </span>
                    </span>
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky text-brand rtl:rotate-180">→</span>
                  </button>
                ))}
              </div>
            ) : (
              <p
                role="status"
                className="rounded-xl bg-white p-3 text-sm text-ink"
              >
                {times.reason === "unavailable"
                  ? slotError("unavailable", ur)
                  : words.empty}
              </p>
            )}
            <button
              className={button + " w-full"}
              onClick={() => {
                setStep("day");
                setError("");
              }}
            >
              {words.back} · {words.day}
            </button>
          </>
        )}
        {step === "confirmation" && pick && svc && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="rounded-xl bg-white p-3 text-sm text-ink ring-1 ring-line">
              <p className="font-semibold">{svc.name[lang]}</p>
              <p>{dayTitle(lang, pick.date, true)}</p>
              <p className="tabular-nums" dir="ltr">
                {clock(lang, pick.time)} – {clock(lang, pick.endTime)}
              </p>
              <p>{pick.doctorName}</p>
            </div>
            {!start.reschedule &&
              (["name", "phone", "email"] as const).map((field) => (
                <label
                  key={field}
                  className="block text-xs font-semibold text-ink"
                >
                  {t[field]}
                  <input
                    required
                    minLength={
                      field === "name" ? 2 : field === "phone" ? 10 : undefined
                    }
                    type={
                      field === "email"
                        ? "email"
                        : field === "phone"
                          ? "tel"
                          : "text"
                    }
                    autoComplete={field === "phone" ? "tel" : field}
                    value={form[field]}
                    disabled={busy}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, [field]: e.target.value }));
                      key.current = "";
                    }}
                    className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal"
                  />
                </label>
              ))}
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 w-full rounded-xl bg-brand px-3 py-3 text-sm font-semibold text-white transition-colors enabled:hover:bg-brand-deep disabled:opacity-60"
            >
              {busy
                ? t.loading
                : start.reschedule
                  ? ur
                    ? "نئے وقت کی تصدیق"
                    : "Confirm new time"
                  : t.confirmBooking}
            </button>
          </form>
        )}
      </div>
    </motion.div>
  );
}
