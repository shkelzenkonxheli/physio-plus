import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, ChevronLeft, Clock, Loader2, MapPin } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { BookingCalendar } from "@/components/site/BookingCalendar";
import { PublicBookingWizard } from "@/components/booking/PublicBookingWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchClinicBookingCatalog,
  fetchClinicServiceSlots,
  fetchClinicServiceWorkingDays,
  fetchPhysioBySlug,
  fetchServiceLocations,
  fetchServicePractitioners,
} from "@/lib/queries";
import { formatDuration, formatPrice, formatTime, formatLongDate, toDateKey } from "@/lib/format";
import { translateError } from "@/lib/labels";
import { serviceIcon } from "@/lib/service-icons";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type BookingSearch = { sherbimi?: string | undefined };

export const Route = createFileRoute("/rezervo/$slug")({
  validateSearch: (search: Record<string, unknown>): BookingSearch => ({
    sherbimi: typeof search["sherbimi"] === "string" ? search["sherbimi"] : undefined,
  }),
  loader: async ({ params }) => {
    const physio = await fetchPhysioBySlug(params.slug);
    if (!physio) throw notFound();
    return { physio };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Rezervim | PhysioPlus" }, { name: "robots", content: "noindex" }] };
    }
    const p = loaderData.physio;
    const title = `Rezervo termin te ${p.first_name} ${p.last_name} | PhysioPlus`;
    const description = `Zgjidh shërbimin, datën dhe orën dhe rezervo termin online te ${p.first_name} ${p.last_name}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: BookingPage,
});

const clientSchema = z.object({
  firstName: z.string().trim().min(2, "Emri duhet të ketë së paku 2 shkronja").max(60),
  lastName: z.string().trim().min(2, "Mbiemri duhet të ketë së paku 2 shkronja").max(60),
  email: z.string().trim().email("Email-i nuk është i vlefshëm").max(255),
  phone: z.string().trim().min(6, "Numri i telefonit nuk është i vlefshëm").max(30),
  message: z.string().trim().max(500, "Mesazhi është shumë i gjatë").optional(),
});

const bookingDb = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function isPublicBookingWizardEnabled() {
  return true;
}

function BookingPage() {
  const { physio } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const clinicId = physio.clinic_id as string;
  const { data: catalog = [], isLoading: catalogLoading } = useQuery({
    queryKey: ["public-clinic-booking-catalog", clinicId],
    queryFn: () => fetchClinicBookingCatalog(clinicId),
  });
  const services = useMemo(
    () =>
      catalog.map((row) => ({
        id: row.service_id,
        category_id: row.category_id,
        name: row.service_name,
        description: row.description,
        duration_minutes: row.duration_minutes,
        price: Number(row.price),
        currency: row.currency,
      })),
    [catalog],
  );
  const [serviceId, setServiceId] = useState<string | null>(search.sherbimi ?? null);
  const [practitionerChoice, setPractitionerChoice] = useState<string | "any" | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(toDateKey(new Date()));
  const [slot, setSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<null | {
    start: string;
    price: number;
    serviceName: string;
    duration: number;
    practitionerName: string;
    locationName: string;
  }>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!search.sherbimi || services.some((item) => item.id === search.sherbimi)) return;
    const legacy = (physio.services ?? []).find((item) => item.id === search.sherbimi);
    const mapped = legacy
      ? services.find(
          (item) => item.name === legacy.name && item.duration_minutes === legacy.duration_minutes,
        )
      : null;
    setServiceId(mapped?.id ?? null);
  }, [physio.services, search.sherbimi, services]);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const groups = useMemo(() => {
    const result = new Map<string, { id: string; name: string; items: typeof services }>();
    for (const row of catalog) {
      const id = row.category_id ?? "__rest";
      const group = result.get(id) ?? {
        id,
        name: row.category_name ?? "Të tjera",
        items: [],
      };
      const item = services.find((candidate) => candidate.id === row.service_id);
      if (item) group.items.push(item);
      result.set(id, group);
    }
    return [...result.values()];
  }, [catalog, services]);

  const { data: practitioners = [], isLoading: practitionersLoading } = useQuery({
    queryKey: ["public-service-practitioners", clinicId, serviceId],
    queryFn: () => fetchServicePractitioners(clinicId, serviceId as string),
    enabled: Boolean(serviceId),
  });
  useEffect(() => {
    if (practitioners.length === 1) setPractitionerChoice(practitioners[0]?.id ?? null);
  }, [practitioners]);

  const { data: closedDates = [] } = useQuery({
    queryKey: ["closed-dates", practitionerChoice],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_exceptions")
        .select("date, closed")
        .eq("physiotherapist_id", practitionerChoice as string)
        .eq("closed", true);
      if (error) throw error;
      return (data ?? []).map((r) => r.date as string);
    },
    enabled: Boolean(practitionerChoice && practitionerChoice !== "any"),
  });

  useEffect(() => {
    if (!user) return;
    setForm((f) => ({ ...f, email: f.email || (user.email ?? "") }));
  }, [user]);

  const { data: bookingLocations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["booking-locations", clinicId, serviceId, practitionerChoice],
    queryFn: () =>
      fetchServiceLocations(
        clinicId,
        serviceId as string,
        practitionerChoice === "any" ? null : (practitionerChoice as string),
      ),
    enabled: Boolean(serviceId && practitionerChoice),
  });

  useEffect(() => {
    if (bookingLocations.length === 1) {
      setLocationId(bookingLocations[0]?.id ?? null);
    } else if (!bookingLocations.some((location) => location.id === locationId)) {
      setLocationId(null);
    }
  }, [bookingLocations, locationId]);

  const bookingLocation = bookingLocations.find((location) => location.id === locationId) ?? null;

  const { data: workingDays = [] } = useQuery({
    queryKey: ["booking-working-days", clinicId, serviceId, practitionerChoice, locationId],
    queryFn: () =>
      fetchClinicServiceWorkingDays(
        clinicId,
        locationId as string,
        serviceId as string,
        practitionerChoice === "any" ? null : (practitionerChoice as string),
      ),
    enabled: Boolean(serviceId && locationId && bookingLocation),
  });

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["slots", clinicId, serviceId, practitionerChoice, locationId, date],
    queryFn: () =>
      fetchClinicServiceSlots(
        clinicId,
        locationId as string,
        serviceId as string,
        date,
        practitionerChoice === "any" ? null : (practitionerChoice as string),
      ),
    enabled: Boolean(serviceId && practitionerChoice && locationId && bookingLocation && date),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !slot || !bookingLocation) return;
    const parsed = clientSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const { data, error } = await bookingDb.rpc("book_clinic_service_appointment", {
      _clinic_id: clinicId,
      _location_id: bookingLocation.id,
      _clinic_service_id: service.id,
      _physio_id: practitionerChoice === "any" ? null : practitionerChoice,
      _start_at: slot,
      _first_name: parsed.data.firstName,
      _last_name: parsed.data.lastName,
      _email: parsed.data.email,
      _phone: parsed.data.phone,
      ...(parsed.data.message ? { _message: parsed.data.message } : {}),
    });
    setSubmitting(false);
    if (error) {
      toast.error(translateError(error));
      setSlot(null);
      return;
    }
    const appt = data as unknown as {
      start_at: string;
      price: number;
      physiotherapist_id: string;
    };
    const assigned = practitioners.find((item) => item.id === appt.physiotherapist_id);
    setConfirmed({
      start: appt.start_at,
      price: Number(appt.price),
      serviceName: service.name,
      duration: service.duration_minutes,
      practitionerName: assigned
        ? `${assigned.first_name} ${assigned.last_name}`
        : "Profesionisti i caktuar",
      locationName: bookingLocation.name,
    });
  }

  // The public booking experience is intentionally a focused, step-by-step
  // wizard. The existing booking queries and RPC remain the source of truth.
  if (isPublicBookingWizardEnabled()) {
    return (
      <SiteLayout>
        <PublicBookingWizard
          groups={groups}
          catalogLoading={catalogLoading}
          service={service}
          selectService={(id) => {
            setServiceId(id);
            setPractitionerChoice(null);
            setLocationId(null);
            setSlot(null);
          }}
          practitioners={practitioners}
          practitionersLoading={practitionersLoading}
          practitionerChoice={practitionerChoice}
          selectPractitioner={(id) => {
            setPractitionerChoice(id);
            setLocationId(null);
            setSlot(null);
          }}
          locations={bookingLocations}
          locationsLoading={locationsLoading}
          locationId={locationId}
          selectLocation={(id) => {
            setLocationId(id);
            setSlot(null);
          }}
          workingDays={workingDays}
          closedDates={closedDates}
          date={date}
          selectDate={(value) => {
            setDate(value);
            setSlot(null);
          }}
          slots={slots}
          slotsLoading={slotsLoading}
          slot={slot}
          selectSlot={setSlot}
          form={form}
          setForm={setForm}
          errors={errors}
          submitting={submitting}
          submit={submit}
          confirmed={confirmed}
        />
      </SiteLayout>
    );
  }

  if (confirmed) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-xl px-4 py-16">
          <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-card">
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <h1 className="mt-4 text-2xl font-bold">Kërkesa u dërgua!</h1>
            <p className="mt-2 text-muted-foreground">
              Termini juaj është duke pritur konfirmimin e fizioterapeutit.
            </p>
            <dl className="mt-6 space-y-2 rounded-2xl bg-muted/60 p-4 text-left text-sm">
              <Row label="Profesionisti" value={confirmed.practitionerName} />
              <Row label="Shërbimi" value={confirmed.serviceName} />
              <Row label="Lokacioni" value={confirmed.locationName} />
              <Row label="Data" value={formatLongDate(confirmed.start)} />
              <Row label="Ora" value={formatTime(confirmed.start)} />
              <Row label="Kohëzgjatja" value={formatDuration(confirmed.duration)} />
              <Row label="Çmimi" value={formatPrice(confirmed.price)} />
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              Do të merrni njoftim sapo fizioterapeuti ta konfirmojë terminin.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {user ? (
                <Button asChild>
                  <Link to="/llogaria/terminet">Shiko terminet e mia</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/regjistrohu">Krijo llogari për t'i menaxhuar terminet</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to="/$slug" params={{ slug: physio.slug }}>
                  Kthehu te profili
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/$slug" params={{ slug: physio.slug }}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Kthehu te profili
          </Link>
        </Button>
        <h1 className="text-2xl font-bold sm:text-3xl">
          Rezervo termin te {physio.first_name} {physio.last_name}
        </h1>

        {catalogLoading ? (
          <Skeleton className="mt-8 h-40 rounded-2xl" />
        ) : services.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Ky fizioterapeut nuk ka ende shërbime aktive.
          </p>
        ) : (
          <div className="mt-8 space-y-8">
            <section>
              <h2 className="font-semibold">1. Zgjidh shërbimin</h2>
              <div className="mt-3 space-y-6">
                {groups.map((g) => (
                  <div key={g.id}>
                    {groups.length > 1 ? (
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.name}
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      {g.items.map((s) => {
                        const Icon = serviceIcon(s.name, s.description);
                        return (
                          <button
                            key={s.id}
                            onClick={() => {
                              setServiceId(s.id);
                              setPractitionerChoice(null);
                              setLocationId(null);
                              setSlot(null);
                              requestAnimationFrame(() =>
                                document
                                  .getElementById("hapi-profesionisti")
                                  ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                              );
                            }}
                            className={cn(
                              "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors",
                              serviceId === s.id
                                ? "border-primary bg-primary/5"
                                : "border-border bg-card hover:bg-muted/60",
                            )}
                          >
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                              <Icon className="h-11 w-11" strokeWidth={1.5} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold">{s.name}</span>
                              {s.description ? (
                                <span className="block text-sm text-muted-foreground">
                                  {s.description}
                                </span>
                              ) : null}
                              <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />{" "}
                                {formatDuration(s.duration_minutes)}
                              </span>
                            </span>
                            <span className="shrink-0 font-bold text-primary">
                              {formatPrice(s.price, s.currency)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {service ? (
              <section id="hapi-profesionisti" className="scroll-mt-24">
                <h2 className="font-semibold">2. Zgjidh profesionistin</h2>
                {practitionersLoading ? (
                  <Skeleton className="mt-3 h-20 rounded-2xl" />
                ) : practitioners.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {practitioners.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPractitionerChoice("any");
                          setLocationId(null);
                          setSlot(null);
                        }}
                        className={cn(
                          "rounded-2xl border p-4 text-left transition-colors",
                          practitionerChoice === "any"
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:bg-muted/60",
                        )}
                      >
                        <span className="block font-semibold">Nuk ka rëndësi cili</span>
                        <span className="text-sm text-muted-foreground">
                          Sistemi cakton një profesionist të lirë.
                        </span>
                      </button>
                    ) : null}
                    {practitioners.map((practitioner) => (
                      <button
                        key={practitioner.id}
                        type="button"
                        onClick={() => {
                          setPractitionerChoice(practitioner.id);
                          setLocationId(null);
                          setSlot(null);
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                          practitionerChoice === practitioner.id
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:bg-muted/60",
                        )}
                      >
                        <span className="h-11 w-11 overflow-hidden rounded-full bg-muted">
                          {practitioner.photo_url ? (
                            <img
                              src={practitioner.photo_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </span>
                        <span>
                          <span className="block font-semibold">
                            {practitioner.first_name} {practitioner.last_name}
                          </span>
                          {practitioner.professional_title ? (
                            <span className="text-sm text-muted-foreground">
                              {practitioner.professional_title}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    Ky shërbim nuk ka profesionist aktiv.
                  </p>
                )}
              </section>
            ) : null}

            {service && practitionerChoice ? (
              <section id="hapi-lokacioni" className="scroll-mt-24">
                <h2 className="font-semibold">3. Zgjidh lokacionin</h2>
                {locationsLoading ? (
                  <Skeleton className="mt-3 h-20 rounded-2xl" />
                ) : bookingLocations.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {bookingLocations.map((location) => (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() => {
                          setLocationId(location.id);
                          setSlot(null);
                        }}
                        className={cn(
                          "flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                          locationId === location.id
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:bg-muted/60",
                        )}
                      >
                        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span>
                          <span className="block font-semibold">{location.name}</span>
                          {location.address ? (
                            <span className="block text-sm text-muted-foreground">
                              {location.address}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    Ky shërbim nuk ka lokacion aktiv për rezervim.
                  </p>
                )}
              </section>
            ) : null}

            {service && bookingLocation ? (
              <section id="hapi-kalendari" className="scroll-mt-24">
                <h2 className="font-semibold">4. Zgjidh datën</h2>
                <div className="mt-3">
                  <BookingCalendar
                    value={date}
                    onChange={(key) => {
                      setDate(key);
                      setSlot(null);
                    }}
                    workingDays={workingDays}
                    closedDates={closedDates}
                  />
                </div>

                <h2 className="mt-6 font-semibold">4. Zgjidh orën</h2>
                {slotsLoading ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-11 rounded-xl" />
                    ))}
                  </div>
                ) : slots.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {slots.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSlot(s)}
                        className={cn(
                          "rounded-xl border px-2 py-3 text-sm font-medium transition-colors",
                          slot === s
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:bg-muted",
                        )}
                      >
                        {formatTime(s)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 flex items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" /> Nuk ka orare të lira për këtë ditë. Provo
                    një datë tjetër.
                  </p>
                )}
              </section>
            ) : null}

            {service && slot ? (
              <section>
                <h2 className="font-semibold">5. Plotëso të dhënat</h2>
                <form
                  onSubmit={submit}
                  className="mt-3 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      id="firstName"
                      label="Emri"
                      value={form.firstName}
                      error={errors["firstName"]}
                      onChange={(v) => setForm({ ...form, firstName: v })}
                    />
                    <Field
                      id="lastName"
                      label="Mbiemri"
                      value={form.lastName}
                      error={errors["lastName"]}
                      onChange={(v) => setForm({ ...form, lastName: v })}
                    />
                    <Field
                      id="phone"
                      label="Telefoni"
                      value={form.phone}
                      error={errors["phone"]}
                      onChange={(v) => setForm({ ...form, phone: v })}
                    />
                    <Field
                      id="email"
                      label="Email"
                      type="email"
                      value={form.email}
                      error={errors["email"]}
                      onChange={(v) => setForm({ ...form, email: v })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="message">Mesazh (opsional)</Label>
                    <Textarea
                      id="message"
                      value={form.message}
                      maxLength={500}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Përshkruaj shkurt problemin ose nevojën tënde"
                    />
                    {errors["message"] ? (
                      <p className="text-sm text-destructive">{errors["message"]}</p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl bg-muted/60 p-4 text-sm">
                    <Row label="Shërbimi" value={service.name} />
                    <Row
                      label="Profesionisti"
                      value={
                        practitionerChoice === "any"
                          ? "Profesionisti i parë i lirë"
                          : (() => {
                              const selected = practitioners.find(
                                (item) => item.id === practitionerChoice,
                              );
                              return selected
                                ? `${selected.first_name} ${selected.last_name}`
                                : "—";
                            })()
                      }
                    />
                    {bookingLocation ? (
                      <Row label="Lokacioni" value={bookingLocation.name} />
                    ) : null}
                    <Row label="Data" value={formatLongDate(slot)} />
                    <Row label="Ora" value={formatTime(slot)} />
                    <Row label="Kohëzgjatja" value={formatDuration(service.duration_minutes)} />
                    <Row label="Çmimi" value={formatPrice(service.price, service.currency)} />
                  </div>

                  <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Konfirmo rezervimin
                  </Button>
                  {!user ? (
                    <p className="text-center text-xs text-muted-foreground">
                      Mund të rezervosh edhe pa llogari.{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void navigate({ to: "/hyr" })}
                      >
                        Kyçu
                      </button>{" "}
                      për t'i menaxhuar terminet.
                    </p>
                  ) : null}
                </form>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={255}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
