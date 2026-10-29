import type { clinic, services, dentists, faq } from "@/content/clinic";
export type PublicClinic = {
  clinic: typeof clinic;
  services: typeof services;
  dentists: typeof dentists;
  faq: typeof faq;
};
