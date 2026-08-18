import { Globe, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GalleryGrid } from "@/components/site/Lightbox";
import type { ClinicProfile as Clinic } from "@/lib/clinics";
import { DAYS_SQ, formatDate, formatDuration, formatPrice } from "@/lib/format";

export function ClinicProfileView({ clinic }: { clinic: Clinic }) {
  const categories = [...(clinic.clinic_service_categories ?? [])]
    .filter((c) => c.active)
    .sort((a, b) => a.sort_order - b.sort_order);
  const services = (clinic.clinic_services ?? []).filter((s) => s.active);
  const uncategorised = services.filter((s) => !s.category_id);
  const hours = [...(clinic.clinic_working_hours ?? [])]
    .filter((h) => h.active)
    .sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7));
  const daysOff = [...(clinic.clinic_days_off ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {clinic.header_image_url ? (
        <img
          src={clinic.header_image_url}
          alt={`Ambienti i klinikës ${clinic.name}`}
          className="mb-6 h-48 w-full rounded-3xl object-cover sm:h-64"
        />
      ) : null}

      <header className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row">
          {clinic.logo_url ? (
            <img
              src={clinic.logo_url}
              alt={`Logo e klinikës ${clinic.name}`}
              className="h-24 w-24 rounded-2xl border border-border object-contain bg-background p-2"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-secondary text-3xl font-bold text-secondary-foreground">
              {clinic.name[0]}
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">Klinikë fizioterapie</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{clinic.name}</h1>
            <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {[clinic.address, clinic.city?.name, clinic.region?.name].filter(Boolean).join(", ") || "Kosovë"}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {clinic.phone ? (
                <Button asChild size="lg">
                  <a href={`tel:${clinic.phone}`}>
                    <Phone className="mr-2 h-4 w-4" /> Telefono
                  </a>
                </Button>
              ) : null}
              {clinic.whatsapp ? (
                <Button asChild variant="outline" size="lg">
                  <a href={`https://wa.me/${clinic.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                  </a>
                </Button>
              ) : null}
              {clinic.email ? (
                <Button asChild variant="outline" size="lg">
                  <a href={`mailto:${clinic.email}`}>
                    <Mail className="mr-2 h-4 w-4" /> Email
                  </a>
                </Button>
              ) : null}
              {clinic.website ? (
                <Button asChild variant="ghost" size="lg">
                  <a href={clinic.website} target="_blank" rel="noreferrer">
                    <Globe className="mr-2 h-4 w-4" /> Ueb-faqja
                  </a>
                </Button>
              ) : null}
            </div>
            {clinic.phone2 ? (
              <p className="mt-3 text-sm text-muted-foreground">Telefon shtesë: {clinic.phone2}</p>
            ) : null}
          </div>
        </div>
      </header>

      {clinic.description ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Rreth klinikës</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">{clinic.description}</p>
        </section>
      ) : null}

      {services.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Shërbimet dhe çmimet</h2>
          <div className="mt-4 space-y-6">
            {categories.map((cat) => {
              const list = services.filter((s) => s.category_id === cat.id);
              if (!list.length) return null;
              return (
                <div key={cat.id}>
                  <h3 className="font-semibold">{cat.name}</h3>
                  {cat.description ? (
                    <p className="text-sm text-muted-foreground">{cat.description}</p>
                  ) : null}
                  <ServiceList items={list} />
                </div>
              );
            })}
            {uncategorised.length ? (
              <div>
                <h3 className="font-semibold">Shërbime të tjera</h3>
                <ServiceList items={uncategorised} />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {hours.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Orari i punës</h2>
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
            {hours.map((h) => (
              <li key={h.day_of_week} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-medium">{DAYS_SQ[h.day_of_week]}</span>
                <span className="text-muted-foreground">
                  {h.start_time.slice(0, 5)} – {h.end_time.slice(0, 5)}
                  {h.break_start && h.break_end
                    ? ` (pushim ${h.break_start.slice(0, 5)}–${h.break_end.slice(0, 5)})`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          {daysOff.length ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Ditë të mbyllura: {daysOff.map((d) => formatDate(d.date)).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <GalleryGrid images={clinic.gallery} name={clinic.name} />
    </div>
  );
}

function ServiceList({
  items,
}: {
  items: { id: string; name: string; description: string | null; price: number; currency: string; duration_minutes: number }[];
}) {
  return (
    <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="font-medium">{s.name}</p>
            {s.description ? <p className="text-sm text-muted-foreground">{s.description}</p> : null}
            <p className="text-sm text-muted-foreground">{formatDuration(s.duration_minutes)}</p>
          </div>
          <span className="font-semibold text-primary">{formatPrice(Number(s.price))}</span>
        </li>
      ))}
    </ul>
  );
}
