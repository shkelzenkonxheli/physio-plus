import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";

export const Route = createFileRoute("/kontakti")({
  head: () => ({
    meta: [
      { title: "Kontakti | PhysioPlus" },
      {
        name: "description",
        content: "Na kontakto për pyetje rreth rezervimeve, profileve ose bashkëpunimit me PhysioPlus.",
      },
      { property: "og:title", content: "Kontakti | PhysioPlus" },
      { property: "og:description", content: "Na kontakto — ekipi i PhysioPlus është këtu për ty." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl font-bold">Kontakti</h1>
        <p className="mt-2 text-muted-foreground">
          Ke pyetje rreth rezervimeve ose dëshiron të listohesh si fizioterapeut? Na shkruaj.
        </p>
        <div className="mt-8 space-y-4">
          <a
            href="mailto:info@physioplus.com"
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-card transition-colors hover:bg-muted/60"
          >
            <Mail className="h-5 w-5 text-primary" />
            <span>
              <span className="block font-medium">Email</span>
              <span className="text-sm text-muted-foreground">info@physioplus.com</span>
            </span>
          </a>
          <a
            href="tel:+38344000000"
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-card transition-colors hover:bg-muted/60"
          >
            <Phone className="h-5 w-5 text-primary" />
            <span>
              <span className="block font-medium">Telefoni</span>
              <span className="text-sm text-muted-foreground">+383 44 000 000</span>
            </span>
          </a>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-card">
            <MapPin className="h-5 w-5 text-primary" />
            <span>
              <span className="block font-medium">Adresa</span>
              <span className="text-sm text-muted-foreground">Prishtinë, Kosovë</span>
            </span>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}