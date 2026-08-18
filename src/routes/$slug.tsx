import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, GraduationCap, MapPin, Award, Briefcase, Clock, Star } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PhotoStrip } from "@/components/site/PhotoStrip";
import { StarRating } from "@/components/site/StarRating";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPhysioBySlug, fetchReviews, fetchGallery } from "@/lib/queries";
import { formatDate, formatDuration, formatPrice, DAYS_SQ } from "@/lib/format";
import { serviceIcon } from "@/lib/service-icons";
import { fetchClinicBySlug, type ClinicProfile } from "@/lib/clinics";
import { ClinicProfileView } from "@/components/site/ClinicProfile";

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }) => {
    const physio = await fetchPhysioBySlug(params.slug);
    if (physio) return { kind: "physio" as const, physio };
    const clinic = await fetchClinicBySlug(params.slug);
    if (clinic) return { kind: "clinic" as const, clinic };
    throw notFound();
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Profili nuk u gjet | PhysioPlus" }, { name: "robots", content: "noindex" }],
      };
    }
    if (loaderData.kind === "clinic") {
      const c = loaderData.clinic;
      const city = c.city?.name ?? "Kosovë";
      const title = `${c.name} – Klinikë fizioterapie në ${city} | PhysioPlus`;
      const description =
        c.description?.slice(0, 155) ??
        `Shërbimet, çmimet dhe orari i klinikës ${c.name} në ${city}. Kontakto direkt përmes PhysioPlus.`;
      const image = c.header_image_url ?? c.logo_url;
      return {
        meta: [
          { title },
          { name: "description", content: description },
          { property: "og:title", content: title },
          { property: "og:description", content: description },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary_large_image" },
          ...(image?.startsWith("https://")
            ? [
                { property: "og:image", content: image },
                { name: "twitter:image", content: image },
              ]
            : []),
        ],
        scripts: [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "MedicalClinic",
              name: c.name,
              ...(c.website ? { url: c.website } : {}),
              ...(c.phone ? { telephone: c.phone } : {}),
              address: {
                "@type": "PostalAddress",
                streetAddress: c.address ?? undefined,
                addressLocality: city,
                addressCountry: "XK",
              },
            }),
          },
        ],
      };
    }
    const p = loaderData.physio;
    const city = p.city?.name ?? "Kosovë";
    const title = `${p.first_name} ${p.last_name} – Fizioterapeut në ${city} | PhysioPlus`;
    const description = `Shiko profilin, shërbimet, çmimet dhe oraret e ${p.first_name} ${p.last_name} në PhysioPlus. Rezervo termin online.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(p.photo_url?.startsWith("https://")
          ? [
              { property: "og:image", content: p.photo_url },
              { name: "twitter:image", content: p.photo_url },
            ]
          : []),
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Physician",
            name: `${p.first_name} ${p.last_name}`,
            medicalSpecialty: "Physiotherapy",
            address: { "@type": "PostalAddress", addressLocality: city, addressCountry: "XK" },
            ...(p.rating_count > 0
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: p.rating_avg,
                    reviewCount: p.rating_count,
                  },
                }
              : {}),
          }),
        },
      ],
    };
  },
  notFoundComponent: ProfileNotFound,
  component: SlugPage,
});

function SlugPage() {
  const data = Route.useLoaderData();
  if (data.kind === "clinic") {
    return (
      <SiteLayout>
        <ClinicProfileView clinic={data.clinic as ClinicProfile} />
      </SiteLayout>
    );
  }
  return <ProfilePage physio={data.physio} />;
}

function ProfileNotFound() {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Profili nuk u gjet</h1>
        <p className="mt-2 text-muted-foreground">
          Ky profil nuk ekziston ose nuk është publikuar ende.
        </p>
        <Button asChild className="mt-6">
          <Link to="/fizioterapeutet">Shiko fizioterapeutët</Link>
        </Button>
      </div>
    </SiteLayout>
  );
}

function ProfilePage({ physio }: { physio: NonNullable<Awaited<ReturnType<typeof fetchPhysioBySlug>>> }) {
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["reviews", physio.id],
    queryFn: () => fetchReviews(physio.id),
  });
  const { data: gallery } = useQuery({
    queryKey: ["gallery", "PHYSIOTHERAPIST", physio.id],
    queryFn: () => fetchGallery("PHYSIOTHERAPIST", physio.id),
  });
  const [lightbox, setLightbox] = useState<string | null>(null);

  const categories = [...(physio.service_categories ?? [])]
    .filter((c) => c.active)
    .sort((a, b) => a.sort_order - b.sort_order);
  const services = (physio.services ?? []).filter((s) => s.active);
  const uncategorised = services.filter((s) => !s.category_id);
  const specs = (physio.specializations ?? [])
    .map((s) => s.specializations?.name)
    .filter(Boolean) as string[];
  const hours = [...(physio.working_hours ?? [])]
    .filter((h) => h.active)
    .sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7));

  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-10 pb-28 lg:pb-10">
        <header className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
          <div className="h-24 bg-gradient-to-r from-primary/25 via-primary/10 to-secondary sm:h-32" />
          <div className="-mt-12 flex flex-col gap-5 p-6 sm:-mt-14 sm:flex-row sm:p-8">
            {physio.photo_url ? (
              <img
                src={physio.photo_url}
                alt={`Foto e ${physio.first_name} ${physio.last_name}`}
                className="h-28 w-28 shrink-0 rounded-2xl border-4 border-card object-cover shadow-card sm:h-32 sm:w-32"
              />
            ) : (
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border-4 border-card bg-secondary text-3xl font-bold text-secondary-foreground shadow-card sm:h-32 sm:w-32">
                {physio.first_name?.[0]}
                {physio.last_name?.[0]}
              </div>
            )}
            <div className="flex-1 sm:pt-14">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold sm:text-3xl">
                  {physio.first_name} {physio.last_name}
                </h1>
                {physio.verification === "VERIFIED" ? (
                  <Badge className="gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" /> I verifikuar nga PhysioPlus
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-muted-foreground">
                {physio.professional_title ?? "Fizioterapeut"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <StarRating value={Number(physio.rating_avg)} count={physio.rating_count} size="md" />
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {physio.city?.name ?? "—"}
                  {physio.region?.name ? `, ${physio.region.name}` : ""}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild size="lg">
                  <Link to="/rezervo/$slug" params={{ slug: physio.slug }}>
                    Rezervo termin
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/kontakti">Kontakto</Link>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {gallery && gallery.length ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold">Galeria</h2>
            <div className="mt-4">
              <PhotoStrip
                images={gallery}
                fallbackAlt={`Foto e ${physio.first_name} ${physio.last_name}`}
                onSelect={setLightbox}
              />
            </div>
          </section>
        ) : null}

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
        {physio.bio || physio.education || physio.experience || physio.certifications ? (
          <section className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-card">
            <h2 className="text-xl font-bold">Rreth meje</h2>
            {physio.bio ? <p className="mt-3 whitespace-pre-line text-muted-foreground">{physio.bio}</p> : null}
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {physio.experience ? (
                <InfoBlock icon={Briefcase} title="Përvoja" text={physio.experience} />
              ) : null}
              {physio.education ? (
                <InfoBlock icon={GraduationCap} title="Arsimi" text={physio.education} />
              ) : null}
              {physio.certifications ? (
                <InfoBlock icon={Award} title="Certifikimet" text={physio.certifications} />
              ) : null}
            </div>
          </section>
        ) : null}

        {specs.length ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold">Specializimet</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {specs.map((s) => (
                <Badge key={s} variant="secondary" className="px-3 py-1 text-sm font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-xl font-bold">Shërbimet</h2>
          {services.length === 0 ? (
            <p className="mt-3 text-muted-foreground">Ende nuk ka shërbime të publikuara.</p>
          ) : (
            <div className="mt-4 space-y-6">
              {categories.map((cat) => {
                const items = services.filter((s) => s.category_id === cat.id);
                if (!items.length) return null;
                return (
                  <div key={cat.id}>
                    <h3 className="font-semibold">{cat.name}</h3>
                    {cat.description ? (
                      <p className="text-sm text-muted-foreground">{cat.description}</p>
                    ) : null}
                    <div className="mt-3 space-y-3">
                      {items.map((s) => (
                        <ServiceRow key={s.id} service={s} slug={physio.slug} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {uncategorised.length ? (
                <div>
                  <h3 className="font-semibold">Të tjera</h3>
                  <div className="mt-3 space-y-3">
                    {uncategorised.map((s) => (
                      <ServiceRow key={s.id} service={s} slug={physio.slug} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Vlerësimet</h2>
          {reviewsLoading ? (
            <Skeleton className="mt-3 h-24 rounded-2xl" />
          ) : reviews && reviews.length ? (
            <div className="mt-3 space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <StarRating value={r.rating} />
                    <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                  </div>
                  {r.comment ? <p className="mt-2 text-sm">{r.comment}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-muted-foreground">Ende nuk ka vlerësime për këtë profil.</p>
          )}
        </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
              <p className="flex items-center gap-2 font-semibold">
                <Star className="h-4 w-4 text-primary" /> Rezervo online
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Zgjidh shërbimin dhe orarin e lirë brenda pak sekondash.
              </p>
              <Button asChild className="mt-4 w-full" size="lg">
                <Link to="/rezervo/$slug" params={{ slug: physio.slug }}>
                  Rezervo termin
                </Link>
              </Button>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
              <p className="flex items-center gap-2 font-semibold">
                <Clock className="h-4 w-4 text-primary" /> Disponueshmëria
              </p>
              <div className="mt-3 divide-y divide-border">
                {DAYS_SQ.map((day, idx) => {
                  const h = hours.find((x) => x.day_of_week === idx);
                  return (
                    <div key={day} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="font-medium">{day}</span>
                      <span className="text-right text-muted-foreground">
                        {h
                          ? `${h.start_time.slice(0, 5)} – ${h.end_time.slice(0, 5)}`
                          : "Mbyllur"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {physio.address ? (
              <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
                <p className="flex items-center gap-2 font-semibold">
                  <MapPin className="h-4 w-4 text-primary" /> Lokacioni
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {physio.address}
                  {physio.city?.name ? `, ${physio.city.name}` : ""}
                </p>
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-4"
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          <img src={lightbox} alt="" className="max-h-[85vh] max-w-full rounded-2xl object-contain" />
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <Button asChild size="lg" className="w-full">
          <Link to="/rezervo/$slug" params={{ slug: physio.slug }}>
            Rezervo termin
          </Link>
        </Button>
      </div>
    </SiteLayout>
  );
}

function InfoBlock({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Award;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-muted/60 p-4">
      <div className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function ServiceRow({
  service,
  slug,
}: {
  service: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    duration_minutes: number;
  };
  slug: string;
}) {
  const Icon = serviceIcon(service.name, service.description);
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-11 w-11" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{service.name}</p>
        {service.description ? (
          <p className="text-sm text-muted-foreground">{service.description}</p>
        ) : null}
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(service.duration_minutes)} ·{" "}
          <span className="font-semibold text-primary">
            {formatPrice(service.price, service.currency)}
          </span>
        </p>
      </div>
      <Button asChild>
        <Link to="/rezervo/$slug" params={{ slug }} search={{ sherbimi: service.id }}>
          Rezervo termin
        </Link>
      </Button>
    </div>
  );
}