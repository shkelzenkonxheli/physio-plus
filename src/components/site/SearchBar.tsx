import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchRegions } from "@/lib/queries";

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [city, setCity] = useState("all");

  const { data: regions = [] } = useQuery({ queryKey: ["regions"], queryFn: fetchRegions });
  const cities = regions.find((r) => r.slug === region)?.cities ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void navigate({
      to: "/fizioterapeutet",
      search: {
        q: q.trim() || undefined,
        regjioni: region !== "all" ? region : undefined,
        qyteti: city !== "all" ? city : undefined,
      },
    });
  }

  return (
    <form
      onSubmit={submit}
      className={`grid gap-3 rounded-2xl border border-border bg-card p-3 shadow-lift ${
        compact ? "sm:grid-cols-[1fr_auto]" : "md:grid-cols-[1.6fr_1fr_1fr_auto]"
      }`}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Kërko fizioterapeut ose shërbim"
          className="h-12 pl-9"
          maxLength={80}
          aria-label="Kërko fizioterapeut ose shërbim"
        />
      </div>
      {!compact ? (
        <>
          <Select
            value={region}
            onValueChange={(v) => {
              setRegion(v);
              setCity("all");
            }}
          >
            <SelectTrigger className="h-12" aria-label="Regjioni">
              <SelectValue placeholder="Regjioni" />
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
          <Select value={city} onValueChange={setCity} disabled={region === "all"}>
            <SelectTrigger className="h-12" aria-label="Qyteti">
              <SelectValue placeholder="Qyteti" />
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
        </>
      ) : null}
      <Button type="submit" size="lg" className="h-12">
        Kërko
      </Button>
    </form>
  );
}