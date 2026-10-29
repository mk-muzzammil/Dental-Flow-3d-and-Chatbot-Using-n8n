// Lightweight browser counterpart to the server's Temporal-based currentWeek.
// UTC arithmetic is used only after extracting the clinic's local calendar date.
export function bookingWeekStart(now: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

export type TimeOption = {
  date: string;
  time: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  doctor: string;
  doctorName: string;
};
export type DayOption = {
  date: string;
  available: boolean;
  reason?: string;
  count: number;
};
export type AvailabilityAnswer = {
  pending?: boolean;
  timezone: string;
  version: string;
  durationMin: number;
  serviceName: string;
  days?: DayOption[];
  options: TimeOption[];
  reason?: string;
};
export const slotError = (code: string, urdu = false) => {
  const en: Record<string, string> = {
    "too-many": "This phone number already has two upcoming appointments. View your appointments or contact the clinic.",
    "invalid-name": "Please enter the patient’s full name.",
    "invalid-phone": "Please enter a valid mobile number.",
    "invalid-email": "Please enter a valid email address.",
    outcome_uncertain: "The booking result is still being checked. Retry this request or contact the clinic before making another booking.",
    "booking-update-pending": "A time change is still being completed. Resume the interrupted change before making another change.",
    "off-grid": "Choose one of the listed appointment times.",
    "outside-hours":
      "The appointment would run outside working hours. Choose another time.",
    "invalid-date-time": "Please choose a valid date and time from the picker.",
    past: "That time has passed. Choose another time.",
    "outside-current-week": "Please choose a day in the current week.",
    closed: "The clinic is closed that day.",
    "fully-booked": "There are no available times for this service that day.",
    "slot-taken": "That time was just taken. Please choose another time.",
    "configuration-changed":
      "The clinic settings changed. Please review the updated times and duration.",
    "invalid-duration":
      "This service needs a duration update. Please contact the clinic.",
    "service-inactive": "This service is no longer available.",
    unavailable: "We could not check the calendar. Please try again.",
    already_running:
      "Another booking is being processed. Please try again shortly.",
    "nothing-free-this-week":
      "No bookable day remains this week. Please contact the clinic; next week is not available in this picker.",
  };
  return urdu
    ? {
        "nothing-free-this-week":
          "اس ہفتے کوئی وقت دستیاب نہیں۔ براہِ کرم کلینک سے رابطہ کریں۔",
        closed: "اس دن کلینک بند ہے۔",
        past: "یہ وقت گزر چکا ہے۔ دوسرا وقت منتخب کریں۔",
        "configuration-changed":
          "کلینک کی ترتیبات بدل گئی ہیں۔ نیا وقت اور دورانیہ دیکھ کر تصدیق کریں۔",
      }[code] ||
        "یہ وقت دستیاب نہیں یا تصدیق نہیں ہو سکی۔ براہِ کرم دستیاب اوقات دوبارہ دیکھیں۔"
    : en[code] || "We could not confirm this booking. Please try again.";
};
