import { supabase } from "@/integrations/supabase/client";

const CLINIC_SELECT = `
  id, name, slug, description, address, phone, phone2, whatsapp, email, website,
  logo_url, header_image_url, active,
  city:cities(name, slug), region:regions(name, slug),
  clinic_service_categories(id, name, description, sort_order, active),
  clinic_services(id, name, description, price, currency, duration_minutes, category_id, active),
  clinic_working_hours(day_of_week, start_time, end_time, break_start, break_end, active),
  clinic_days_off(date, reason)
`;

export type ClinicProfile = NonNullable<Awaited<ReturnType<typeof fetchClinicBySlug>>>;

export async function fetchClinicBySlug(slug: string) {
  const { data, error } = await supabase
    .from("clinics")
    .select(CLINIC_SELECT)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: gallery } = await supabase
    .from("profile_gallery_images")
    .select("id, url, alt")
    .eq("owner_type", "CLINIC")
    .eq("owner_id", data.id)
    .order("sort_order");
  return { ...data, gallery: gallery ?? [] };
}

export async function fetchClinics() {
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, slug, logo_url, address, phone, active, city:cities(name, slug)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
