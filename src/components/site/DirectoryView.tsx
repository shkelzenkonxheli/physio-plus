import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { PhysioCard } from "./PhysioCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchPhysiotherapists, fetchRegions, fetchSpecializations } from "@/lib/queries";

export type DirectoryInitial = {
  q?: string | undefined;
  region?: string | undefined;
  city?: string | undefined;
  specialization?: string | undefined;
};

export function DirectoryView({
  initial,
  lockedRegion,
}: {
  initial?: DirectoryInitial;
  lockedRegion?: string;
}) {
  const [q, setQ] = useState(initial?.q ?? "");
  const [region, setRegion] = useState(lockedRegion ?? initial?.region ?? "all");
  const [city, setCity] = useState(initial?.city ?? "all");
  const [specialization, setSpecialization] = useState(initial?.specialization ?? "all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [rating, setRating] = useState("all");
  const [verified, setVerified] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [showFilters, setShowFilters] = useState(false);

  const { data: regions = [] } = useQuery({ queryKey: ["regions"], queryFn: fetchRegions });
  const { data: specializations = [] } = useQuery({
    queryKey: ["specializations"],
    queryFn: fetchSpecializations,
  });
  const cities = regions.find((r) => r.slug === region)?.cities ?? [];

  const filters = useMemo(
    () => ({
      q: q || undefined,
      region: region !== "all" ? region : undefined,
      city: city !== "all" ? city : undefined,
      specialization: specialization !== "all" ? specialization : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      rating: rating !== "all" ? Number(rating) : undefined,
      verified: verified || undefined,
      sort,
    }),
    [q, region, city, specialization, minPrice, maxPrice, rating, verified, sort],
  );

  const { data = [], isLoading } = useQuery({
    queryKey: ["physios", filters],
    queryFn: () => fetchPhysiotherapists(filters),
  });

  function clearFilters() {
    setQ("");
    if (!lockedRegion) setRegion("all");
    setCity("all");
    setSpecialization("all");
    setMinPrice("");
    setMaxPrice("");
    setRating("all");
    setVerified(false);
    setSort("recommended");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className={`${showFilters ? "block" : "hidden"} lg:block`}>
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="font-semibold">Filtrat</h2>

          <div className="space-y-1.5">
            <Label htmlFor="q">Kërko</Label>
            <Input
              id="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Emri ose shërbimi"
              maxLength={80}
            />
          </div>

          {!lockedRegion ? (
            <div className="space-y-1.5">
              <Label>Regjioni</Label>
              <Select
                value={region}
                onValueChange={(v) => {
                  setRegion(v);
                  setCity("all");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Të gjitha regjionet</SelectItem>
                  {regions.map((r) => (
                    <SelectItem key={r.slug} value={r.slug}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Qyteti</Label>
            <Select value={city} onValueChange={setCity} disabled={region === "all"}>
              <SelectTrigger>
                <SelectValue placeholder="Të gjitha qytetet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Të gjitha qytetet</SelectItem>
                {cities
                  .filter((c) => c.active)
                  .map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Specializimi</Label>
            <Select value={specialization} onValueChange={setSpecialization}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Të gjitha</SelectItem>
                {specializations.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="min">Çmimi min (€)</Label>
              <Input
                id="min"
                type="number"
                min={0}
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max">Çmimi maks (€)</Label>
              <Input
                id="max"
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vlerësimi</Label>
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Të gjitha</SelectItem>
                <SelectItem value="4">4+ yje</SelectItem>
                <SelectItem value="4.5">4.5+ yje</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="verified">Vetëm të verifikuar</Label>
            <Switch id="verified" checked={verified} onCheckedChange={setVerified} />
          </div>

          <Button variant="outline" className="w-full" onClick={clearFilters}>
            Pastro filtrat
          </Button>
        </div>
      </aside>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Duke kërkuar…" : `${data.length} fizioterapeutë`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Filtrat
            </Button>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">Më të rekomanduarit</SelectItem>
                <SelectItem value="rating">Rating më i lartë</SelectItem>
                <SelectItem value="price_asc">Çmimi më i ulët</SelectItem>
                <SelectItem value="price_desc">Çmimi më i lartë</SelectItem>
                <SelectItem value="newest">Më të rinjtë</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : data.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.map((p) => (
              <PhysioCard key={p.id} physio={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="font-medium">Nuk gjetëm fizioterapeutë për kriteret e zgjedhura.</p>
            <Button className="mt-4" onClick={clearFilters}>
              Pastro filtrat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}