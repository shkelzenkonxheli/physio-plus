import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/site/SiteLayout";
import { DirectoryView } from "@/components/site/DirectoryView";
import { fetchRegions } from "@/lib/queries";

export const Route = createFileRoute("/fizioterapeutet/$qyteti")({
  head: ({ params }) => {
    const name = params.qyteti.charAt(0).toUpperCase() + params.qyteti.slice(1);
    const title = `Fizioterapeutë në ${name} | PhysioPlus`;
    const description = `Gjej fizioterapeutë në ${name}. Shiko shërbimet, çmimet dhe oraret e lira dhe rezervo termin online.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: RegionPage,
});

function RegionPage() {
  const { qyteti } = Route.useParams();
  const { data: regions = [] } = useQuery({ queryKey: ["regions"], queryFn: fetchRegions });
  const region = regions.find((r) => r.slug === qyteti);
  const label = region?.name ?? qyteti;

  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold">Fizioterapeutë në {label}</h1>
        <p className="mt-1 text-muted-foreground">
          Specialistë të fizioterapisë në regjionin e {label}-s, me çmime dhe oraret e lira.
        </p>
        <div className="mt-8">
          <DirectoryView lockedRegion={qyteti} />
        </div>
      </div>
    </SiteLayout>
  );
}