import { Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "./StarRating";
import { formatPrice } from "@/lib/format";
import type { PhysioListItem } from "@/lib/queries";

export function PhysioCard({ physio }: { physio: PhysioListItem }) {
  const prices = (physio.services ?? []).map((s) => Number(s.price)).filter((p) => p > 0);
  const from = prices.length ? Math.min(...prices) : null;
  const specs = (physio.specializations ?? [])
    .map((s) => s.specializations?.name)
    .filter(Boolean)
    .slice(0, 3) as string[];
  const initials = `${physio.first_name?.[0] ?? ""}${physio.last_name?.[0] ?? ""}`;

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-lift">
      <div className="flex gap-4">
        {physio.photo_url ? (
          <img
            src={physio.photo_url}
            alt={`Foto e fizioterapeutit ${physio.first_name} ${physio.last_name}`}
            className="h-16 w-16 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-secondary text-lg font-semibold text-secondary-foreground">
            {initials || "PP"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-semibold">
              {physio.first_name} {physio.last_name}
            </h3>
            {physio.verification === "VERIFIED" ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="I verifikuar" />
            ) : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {physio.professional_title ?? "Fizioterapeut"}
          </p>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {physio.city?.name ?? "—"}
            {physio.region?.name ? `, ${physio.region.name}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <StarRating value={Number(physio.rating_avg)} count={physio.rating_count} />
        {from != null ? (
          <span className="text-sm">
            <span className="text-muted-foreground">nga </span>
            <span className="font-semibold">{formatPrice(from)}</span>
          </span>
        ) : null}
      </div>

      {specs.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {specs.map((s) => (
            <Badge key={s} variant="secondary" className="font-normal">
              {s}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button asChild variant="outline" className="flex-1">
          <Link to="/$slug" params={{ slug: physio.slug }}>
            Shiko profilin
          </Link>
        </Button>
        <Button asChild className="flex-1">
          <Link to="/rezervo/$slug" params={{ slug: physio.slug }}>
            Rezervo termin
          </Link>
        </Button>
      </div>
    </article>
  );
}