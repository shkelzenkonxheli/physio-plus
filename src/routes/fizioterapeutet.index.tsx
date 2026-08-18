import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { DirectoryView } from "@/components/site/DirectoryView";

type DirectorySearch = {
  q?: string | undefined;
  regjioni?: string | undefined;
  qyteti?: string | undefined;
  specializimi?: string | undefined;
};

export const Route = createFileRoute("/fizioterapeutet/")({
  validateSearch: (search: Record<string, unknown>): DirectorySearch => ({
    q: typeof search['q'] === "string" ? search['q'] : undefined,
    regjioni: typeof search['regjioni'] === "string" ? search['regjioni'] : undefined,
    qyteti: typeof search['qyteti'] === "string" ? search['qyteti'] : undefined,
    specializimi: typeof search['specializimi'] === "string" ? search['specializimi'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Fizioterapeutë në Kosovë | PhysioPlus" },
      {
        name: "description",
        content:
          "Lista e fizioterapeutëve në Kosovë me shërbime, çmime dhe vlerësime. Filtro sipas qytetit, specializimit dhe çmimit dhe rezervo online.",
      },
      { property: "og:title", content: "Fizioterapeutë në Kosovë | PhysioPlus" },
      {
        property: "og:description",
        content: "Filtro fizioterapeutë sipas qytetit, specializimit dhe çmimit dhe rezervo online.",
      },
    ],
  }),
  component: DirectoryPage,
});

function DirectoryPage() {
  const search = Route.useSearch();
  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold">Fizioterapeutët</h1>
        <p className="mt-1 text-muted-foreground">
          Gjej specialistin e duhur dhe rezervo terminin online.
        </p>
        <div className="mt-8">
          <DirectoryView
            initial={{
              q: search.q,
              region: search.regjioni,
              city: search.qyteti,
              specialization: search.specializimi,
            }}
          />
        </div>
      </div>
    </SiteLayout>
  );
}