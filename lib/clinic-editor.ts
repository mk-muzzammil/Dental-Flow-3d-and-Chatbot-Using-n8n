/** Shared form metadata. These labels never contain private connection values. */
export type Cell = string | number | boolean;
export type EditorRow = Cell[];
export type Field = {
  label: string;
  kind?:
    | "number"
    | "time"
    | "date"
    | "boolean"
    | "long"
    | "day"
    | "doctor"
    | "specialization";
  required?: boolean;
  min?: number;
  max?: number;
};
export const sections = {
  services: {
    title: "Services",
    description:
      "Treatments, prices and appointment duration. Deactivate a service to stop new bookings while keeping its history.",
    fields: [
      { label: "Internal ID" },
      { label: "Service name", required: true },
      {
        label: "Duration (minutes)",
        kind: "number",
        required: true,
        min: 1,
        max: 480,
      },
      { label: "Price", kind: "number", required: true, min: 0 },
      { label: "Active", kind: "boolean" },
      { label: "Arabic name" },
      { label: "Urdu name" },
      { label: "Specialization", kind: "specialization" },
      { label: "Website description (English)", kind: "long" },
      { label: "Website description (Arabic)", kind: "long" },
      { label: "Website description (Urdu)", kind: "long" },
    ],
  },
  hours: {
    title: "Working hours",
    description:
      "Clinic hours apply unless a doctor has a custom schedule. A custom schedule must include every day that doctor works. One opening period and one optional break per day are supported.",
    fields: [
      { label: "Day", kind: "day", required: true },
      { label: "Opens", kind: "time" },
      { label: "Closes", kind: "time" },
      { label: "Break starts", kind: "time" },
      { label: "Break ends", kind: "time" },
      { label: "Closed", kind: "boolean" },
      { label: "Doctor", kind: "doctor" },
    ],
  },
  holidays: {
    title: "Holidays",
    description:
      "Closed dates for the entire clinic. Existing appointments are not cancelled automatically.",
    fields: [
      { label: "Date", kind: "date", required: true },
      { label: "Reason", required: true },
    ],
  },
  specializations: {
    title: "Specializations",
    description:
      "Create the specializations used in doctor profiles and services. Only enter verified qualifications.",
    fields: [
      { label: "Internal ID" },
      { label: "English name", required: true },
      { label: "Arabic name" },
      { label: "Urdu name" },
      { label: "Active", kind: "boolean" },
    ],
  },
  faq: {
    title: "FAQ answers",
    description:
      "Approved answers used by the chatbot. Keep medical advice within the clinic’s approved guidance.",
    fields: [
      { label: "Topic ID" },
      { label: "Question", required: true },
      { label: "English answer", kind: "long", required: true },
      { label: "Arabic answer", kind: "long" },
      { label: "Urdu answer", kind: "long" },
      { label: "Active", kind: "boolean" },
    ],
  },
} satisfies Record<
  string,
  { title: string; description: string; fields: Field[] }
>;
export type Section = keyof typeof sections;
export const clinicFields = [
  ["clinic_name", "Clinic name (English)"],
  ["clinic_name_ur", "Clinic name (Urdu)"],
  ["clinic_address", "Address (English)"],
  ["clinic_address_ur", "Address (Urdu)"],
  ["clinic_city", "City (English)"],
  ["clinic_city_ur", "City (Urdu)"],
  ["clinic_email", "Public email"],
  ["clinic_phone", "Phone"],
  ["clinic_map_url", "Map URL"],
  ["currency", "Currency"],
  ["default_language", "Default language"],
];
export const bookingFields = [
  ["slot_granularity", "Slot intervals (minutes)"],
  ["hold_minutes", "Hold expiry (minutes)"],
];
export const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
