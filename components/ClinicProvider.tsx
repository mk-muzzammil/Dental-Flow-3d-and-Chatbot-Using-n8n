"use client";
import { createContext, useContext } from "react";
import type { PublicClinic } from "@/lib/public-clinic";
const Context = createContext<PublicClinic | null>(null);
export function ClinicProvider({
  value,
  children,
}: {
  value: PublicClinic;
  children: React.ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useClinic() {
  const value = useContext(Context);
  if (!value) throw new Error("ClinicProvider is required");
  return value;
}
