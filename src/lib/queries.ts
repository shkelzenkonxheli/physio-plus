import { supabase } from "@/integrations/supabase/client";

export type PhysioListItem = {
  id: string;
  slug: string;
  first_name: string;
  last_name: string;
  professional_title: string | null;
  photo_url: string | null;
  rating_avg: number;
  rating_count: number;
  verification: string;
  city: { name: string; slug: string } | null;
  region: { name: string; slug: string } | null;
  services: { price: number; name: string }[];
  specializations: { specializations: { name: string; slug: string } | null }[];
};

const LIST_SELECT = `
  id, slug, first_name, last_name, professional_title, photo_url,
  rating_avg, rating_count, verification,
  city:cities(name, slug), region:regions(name, slug),
  services(price, name),
  specializations:physiotherapist_specializations(specializations(name, slug))
`;

export type DirectoryFilters = {
  q?: string | undefined;
  region?: string | undefined;
  city?: string | undefined;
  specialization?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  rating?: number | undefined;
  verified?: boolean | undefined;
  sort?: string | undefined;
};

export async function fetchRegions() {
  const { data, error } = await supabase
    .from("regions")
    .select("id, name, slug, cities(id, name, slug, active)")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchSpecializations() {
  const { data, error } = await supabase
    .from("specializations")
    .select("id, name, slug")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchPhysiotherapists(filters: DirectoryFilters = {}) {
  let query = supabase.from("physiotherapists").select(LIST_SELECT).eq("status", "APPROVED");

  if (filters.q) {
    const term = filters.q.replace(/[,%()]/g, " ").trim();
    if (term) {
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,professional_title.ilike.%${term}%,bio.ilike.%${term}%`,
      );
    }
  }
  if (filters.verified) query = query.eq("verification", "VERIFIED");
  if (filters.rating) query = query.gte("rating_avg", filters.rating);

  switch (filters.sort) {
    case "rating":
      query = query.order("rating_avg", { ascending: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query
        .order("verification", { ascending: false })
        .order("rating_avg", { ascending: false });
  }

  const { data, error } = await query.limit(60);
  if (error) throw error;

  let rows = (data ?? []) as unknown as PhysioListItem[];

  if (filters.region) rows = rows.filter((r) => r.region?.slug === filters.region);
  if (filters.city) rows = rows.filter((r) => r.city?.slug === filters.city);
  if (filters.specialization) {
    rows = rows.filter((r) =>
      r.specializations?.some((s) => s.specializations?.slug === filters.specialization),
    );
  }
  if (filters.q) {
    const term = filters.q.toLowerCase();
    const matchesBase = (r: PhysioListItem) =>
      `${r.first_name} ${r.last_name} ${r.professional_title ?? ""}`.toLowerCase().includes(term);
    rows = rows.filter(
      (r) =>
        matchesBase(r) ||
        r.services?.some((s) => s.name.toLowerCase().includes(term)) ||
        r.city?.name.toLowerCase().includes(term) ||
        r.specializations?.some((s) => s.specializations?.name.toLowerCase().includes(term)),
    );
  }
  if (filters.minPrice != null || filters.maxPrice != null) {
    rows = rows.filter((r) => {
      const prices = (r.services ?? []).map((s) => Number(s.price));
      if (!prices.length) return false;
      const min = Math.min(...prices);
      if (filters.minPrice != null && min < filters.minPrice) return false;
      if (filters.maxPrice != null && min > filters.maxPrice) return false;
      return true;
    });
  }
  if (filters.sort === "price_asc" || filters.sort === "price_desc") {
    const minOf = (r: PhysioListItem) => {
      const prices = (r.services ?? []).map((s) => Number(s.price));
      return prices.length ? Math.min(...prices) : Number.MAX_SAFE_INTEGER;
    };
    rows = [...rows].sort((a, b) =>
      filters.sort === "price_asc" ? minOf(a) - minOf(b) : minOf(b) - minOf(a),
    );
  }

  return rows;
}

export async function fetchPhysioBySlug(slug: string) {
  const { data, error } = await supabase
    .from("physiotherapists")
    .select(
      `id, slug, first_name, last_name, professional_title, bio, education, experience,
       certifications, photo_url, address, status, verification, rating_avg, rating_count,
       min_cancellation_hours,
       city:cities(name, slug), region:regions(name, slug),
       specializations:physiotherapist_specializations(specializations(name, slug)),
       service_categories(id, name, description, sort_order, active),
       services(id, name, description, price, currency, duration_minutes, category_id, active),
       working_hours(day_of_week, start_time, end_time, break_start, break_end, active)`,
    )
    .eq("slug", slug)
    .eq("status", "APPROVED")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchReviews(physioId: string) {
  return fetchReviewsInner(physioId);
}

export async function fetchGallery(ownerType: "PHYSIOTHERAPIST" | "CLINIC", ownerId: string) {
  const { data, error } = await supabase
    .from("profile_gallery_images")
    .select("id, url, alt, sort_order")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

async function fetchReviewsInner(physioId: string) {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at")
    .eq("physiotherapist_id", physioId)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function fetchBookingLocations(physioId: string, serviceId: string) {
  const { data, error } = await supabase.rpc("booking_locations", {
    _physio_id: physioId,
    _service_id: serviceId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAvailableSlots(
  physioId: string,
  serviceId: string,
  date: string,
  context?: { clinicId: string; locationId: string },
) {
  const { data, error } = await supabase.rpc("available_slots", {
    _physio_id: physioId,
    _service_id: serviceId,
    _date: date,
    ...(context ? { _clinic_id: context.clinicId, _location_id: context.locationId } : {}),
  });
  if (error) throw error;
  return (data ?? []).map((r: { slot: string }) => r.slot);
}
