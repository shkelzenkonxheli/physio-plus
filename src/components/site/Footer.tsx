import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";

const groups = [
  {
    title: "PhysioPlus",
    links: [
      { to: "/rreth-nesh", label: "Rreth nesh" },
      { to: "/si-funksionon", label: "Si funksionon" },
      { to: "/kontakti", label: "Kontakti" },
    ],
  },
  {
    title: "Për klientë",
    links: [
      { to: "/fizioterapeutet", label: "Fizioterapeutët" },
      { to: "/regjionet", label: "Regjionet" },
      { to: "/sherbimet", label: "Shërbimet" },
    ],
  },
  {
    title: "Për fizioterapeutë",
    links: [
      { to: "/regjistrohu-fizioterapeut", label: "Regjistrohu" },
      { to: "/planet", label: "Planet" },
      { to: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Ligjore",
    links: [
      { to: "/kushtet", label: "Kushtet e përdorimit" },
      { to: "/privatesia", label: "Politika e privatësisë" },
      { to: "/cookies", label: "Politika e cookies" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hero-gradient text-primary-foreground">
              <Activity className="h-4 w-4" />
            </span>
            PhysioPlus
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Platforma e fizioterapisë në Kosovë. Gjej, krahaso dhe rezervo termin online.
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <ul className="mt-3 space-y-2">
              {g.links.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PhysioPlus. Të gjitha të drejtat e rezervuara.
      </div>
    </footer>
  );
}