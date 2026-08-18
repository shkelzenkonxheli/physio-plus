import type { Database } from "@/integrations/supabase/types";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
export type ProfileStatus = Database["public"]["Enums"]["profile_status"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const APPOINTMENT_STATUS_SQ: Record<AppointmentStatus, string> = {
  PENDING: "Në pritje",
  CONFIRMED: "I konfirmuar",
  REJECTED: "I refuzuar",
  CANCELLED: "I anuluar",
  COMPLETED: "I përfunduar",
  NO_SHOW: "Nuk u paraqit",
};

export const APPOINTMENT_STATUS_CLASS: Record<AppointmentStatus, string> = {
  PENDING: "bg-warning/15 text-warning-foreground border-warning/40",
  CONFIRMED: "bg-success/15 text-success border-success/40",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/30",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/30",
  COMPLETED: "bg-info/15 text-info border-info/40",
  NO_SHOW: "bg-destructive/20 text-destructive border-destructive/50",
};

export const PROFILE_STATUS_SQ: Record<ProfileStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Në pritje të aprovimit",
  APPROVED: "I aprovuar",
  REJECTED: "I refuzuar",
  SUSPENDED: "I suspenduar",
};

export const ROLE_SQ: Record<AppRole, string> = {
  CLIENT: "Klient",
  PHYSIOTHERAPIST: "Fizioterapeut",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};

const ERROR_SQ: Record<string, string> = {
  SLOT_UNAVAILABLE:
    "Ky termin sapo u rezervua nga një klient tjetër. Ju lutemi zgjidhni një orar tjetër.",
  BOOKING_EXPIRED: "Koha e rezervimit skadoi. Ju lutemi provoni përsëri.",
  UNAUTHORIZED: "Duhet të kyçeni për të vazhduar.",
  FORBIDDEN: "Nuk keni leje për këtë veprim.",
  SERVICE_NOT_FOUND: "Shërbimi nuk u gjet ose nuk është aktiv.",
  PHYSIOTHERAPIST_NOT_FOUND: "Fizioterapeuti nuk u gjet.",
  INVALID_TIME: "Ora e zgjedhur nuk është e vlefshme.",
  INVALID_INPUT: "Të dhënat e plotësuara nuk janë të vlefshme.",
  BOOKING_ALREADY_CANCELLED: "Ky termin është mbyllur tashmë dhe nuk mund të ndryshohet.",
  INVALID_STATUS_TRANSITION: "Ky ndryshim i statusit nuk lejohet.",
  APPOINTMENT_NOT_COMPLETED: "Mund të lini vlerësim vetëm pas një termini të përfunduar.",
  APPOINTMENT_NOT_FOUND: "Termini nuk u gjet.",
  CATEGORY_OWNERSHIP_MISMATCH: "Kategoria nuk të përket ty.",
  "Invalid login credentials": "Email-i ose fjalëkalimi nuk është i saktë.",
  "User already registered": "Ky email është i regjistruar tashmë.",
  "Email not confirmed": "Email-i nuk është konfirmuar ende. Kontrollo kutinë postare.",
};

export function translateError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  for (const [key, value] of Object.entries(ERROR_SQ)) {
    if (raw.includes(key)) return value;
  }
  if (raw.includes("duplicate key")) return "Ky rekord ekziston tashmë.";
  return raw || "Ndodhi një gabim i papritur. Provo përsëri.";
}