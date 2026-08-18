import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarCheck,
  Clock,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import heroImage from "@/assets/hero-physio.jpg";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SearchBar } from "@/components/site/SearchBar";
import { PhysioCard } from "@/components/site/PhysioCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { fetchPhysiotherapists, fetchRegions, fetchSpecializations } from "@/lib/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PhysioPlus – Gjej fizioterapeutin e duhur në Kosovë" },
      {
        name: "description",
        content:
          "Kërko fizioterapeutë në Kosovë, shiko shërbimet, çmimet dhe oraret e lira dhe rezervo termin online në pak klikime.",
      },
      { property: "og:title", content: "PhysioPlus – Fizioterapeutë në Kosovë" },
      {
        property: "og:description",
        content:
          "Kërko fizioterapeutë në Kosovë, shiko shërbimet dhe çmimet dhe rezervo termin online.",
      },
    ],
  }),
  component: Index,
});

const steps = [
  { icon: Search, title: "Kërko", text: "Gjej fizioterapeutë sipas qytetit, shërbimit ose specializimit." },
  { icon: Stethoscope, title: "Zgjidh", text: "Shiko profilet, shërbimet, çmimet dhe kohëzgjatjen." },
  { icon: CalendarCheck, title: "Rezervo", text: "Zgjidh një orar të lirë dhe dërgo kërkesën online." },
  { icon: BadgeCheck, title: "Konfirmo", text: "Merr njoftim sapo fizioterapeuti ta konfirmojë terminin." },
];

const reasons = [
  { icon: ShieldCheck, title: "Profile të kontrolluara", text: "Çdo profil aprovohet nga ekipi i PhysioPlus para se të publikohet." },
  { icon: Clock, title: "Oraret reale", text: "Shfaqen vetëm oraret e lira, të llogaritura nga orari i vërtetë i punës." },
  { icon: Sparkles, title: "Pa telefonata", text: "Rezervo në pak sekonda, në çdo kohë të ditës." },
];

const faqs = [
  {
    q: "A kushton diçka rezervimi në PhysioPlus?",
    a: "Jo. Rezervimi i terminit përmes PhysioPlus është plotësisht falas për klientët. Ti paguan vetëm shërbimin te fizioterapeuti.",
  },
  {
    q: "A duhet të krijoj llogari për të rezervuar?",
    a: "Jo domosdoshmërisht. Mund të rezervosh si vizitor, por me një llogari i menaxhon më lehtë terminet e tua.",
  },
  {
    q: "Si e di se termini u konfirmua?",
    a: "Fizioterapeuti e shqyrton kërkesën dhe ti merr njoftim brenda platformës sapo termini të konfirmohet.",
  },
  {
    q: "A mund ta anuloj terminin?",
    a: "Po. Anulimi lejohet deri në afatin që cakton çdo fizioterapeut, zakonisht 2 orë para terminit.",
  },
  {
    q: "Jam fizioterapeut – si listohem?",
    a: "Regjistrohu, plotëso profilin, kategoritë, shërbimet dhe orarin, dhe dërgoje për aprovim. Pas aprovimit profili publikohet.",
  },
];

function Index() {
  const { data: physios, isLoading } = useQuery({
    queryKey: ["physios", "featured"],
    queryFn: () => fetchPhysiotherapists({ sort: "rating" }),
  });
  const { data: regions = [] } = useQuery({ queryKey: ["regions"], queryFn: fetchRegions });
  const { data: specializations = [] } = useQuery({
    queryKey: ["specializations"],
    queryFn: fetchSpecializations,
  });

  const featured = (physios ?? []).slice(0, 6);
  const verifiedCount = (physios ?? []).filter((p) => p.verification === "VERIFIED").length;

  return (
    <SiteLayout>
      <section className="bg-soft-gradient">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Platformë për Kosovën
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">
              Gjej fizioterapeutin e duhur për ty.
            </h1>
            <p className="mt-4 max-w-lg text-lg text-muted-foreground">
              Kërko fizioterapeutë në Kosovë, shiko shërbimet, çmimet dhe rezervoni termin online.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/fizioterapeutet">Gjej fizioterapeut</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/regjistrohu-fizioterapeut">Regjistrohu si fizioterapeut</Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <img
              src={heroImage}
              alt="Fizioterapeut duke trajtuar një klient në klinikë"
              width={1408}
              height={1104}
              className="w-full rounded-3xl object-cover shadow-lift"
            />
          </div>
        </div>

        <div className="mx-auto -mb-8 max-w-5xl px-4">
          <SearchBar />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <h2 className="text-2xl font-bold">Shërbimet më të kërkuara</h2>
        <p className="mt-1 text-muted-foreground">Zgjidh një fushë dhe shiko specialistët përkatës.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {specializations.map((s) => (
            <Link
              key={s.id}
              to="/fizioterapeutet"
              search={{ specializimi: s.slug }}
              className="rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-lift"
            >
              <Stethoscope className="h-5 w-5 text-primary" />
              <span className="mt-3 block font-medium">{s.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Fizioterapeutët e rekomanduar</h2>
            <p className="mt-1 text-muted-foreground">Profilet me vlerësimet më të mira.</p>
          </div>
          <Button asChild variant="ghost">
            <Link to="/fizioterapeutet">Shiko të gjithë</Link>
          </Button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)
          ) : featured.length ? (
            featured.map((p) => <PhysioCard key={p.id} physio={p} />)
          ) : (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center">
              <p className="font-medium">Ende nuk ka profile të publikuara.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Je fizioterapeut? Bëhu i pari në PhysioPlus.
              </p>
              <Button asChild className="mt-4">
                <Link to="/regjistrohu-fizioterapeut">Regjistrohu si fizioterapeut</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <h2 className="text-2xl font-bold">Kërko sipas regjionit</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {regions.map((r) => (
            <Link
              key={r.id}
              to="/fizioterapeutet/$qyteti"
              params={{ qyteti: r.slug }}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 shadow-card transition-shadow hover:shadow-lift"
            >
              <span className="font-medium">{r.name}</span>
              <MapPin className="h-4 w-4 text-primary" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <h2 className="text-2xl font-bold">Si funksionon</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold">
                {i + 1}. {s.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <h2 className="text-2xl font-bold">Pse PhysioPlus</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {reasons.map((r) => (
            <div key={r.title} className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <r.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{r.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
          <div className="flex flex-wrap items-center gap-4">
            <BadgeCheck className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Fizioterapeutë të verifikuar</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {verifiedCount > 0
                  ? `${verifiedCount} profile mbajnë shenjën "I verifikuar nga PhysioPlus".`
                  : 'Profilet që kalojnë kontrollin e dokumenteve mbajnë shenjën "I verifikuar nga PhysioPlus".'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="overflow-hidden rounded-3xl bg-hero-gradient p-8 text-primary-foreground sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">Je fizioterapeut?</h2>
          <p className="mt-2 max-w-xl opacity-90">
            Krijo profilin tënd, cakto shërbimet, çmimet dhe orarin, dhe prano rezervime online — pa
            telefonata dhe pa letra.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-6">
            <Link to="/regjistrohu-fizioterapeut">Regjistrohu falas</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pt-16">
        <h2 className="text-2xl font-bold">Pyetjet më të shpeshta</h2>
        <Accordion type="single" collapsible className="mt-4">
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </SiteLayout>
  );
}
