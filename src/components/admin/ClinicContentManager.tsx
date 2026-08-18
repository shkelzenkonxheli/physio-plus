import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GalleryManager } from "@/components/panel/GalleryManager";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/labels";
import { DAYS_SQ, formatDate, formatPrice } from "@/lib/format";

export function ClinicContentManager({ clinicId, clinicName }: { clinicId: string; clinicName: string }) {
  const qc = useQueryClient();
  const key = (k: string) => ["clinic", k, clinicId];

  const { data: categories } = useQuery({
    queryKey: key("categories"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_service_categories")
        .select("id, name, description, sort_order, active")
        .eq("clinic_id", clinicId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: services } = useQuery({
    queryKey: key("services"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_services")
        .select("id, name, price, duration_minutes, category_id, active")
        .eq("clinic_id", clinicId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: hours } = useQuery({
    queryKey: key("hours"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_working_hours")
        .select("id, day_of_week, start_time, end_time, active")
        .eq("clinic_id", clinicId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: daysOff } = useQuery({
    queryKey: key("daysoff"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_days_off")
        .select("id, date, reason")
        .eq("clinic_id", clinicId)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const refetch = (k: string) => void qc.invalidateQueries({ queryKey: key(k) });

  const [catName, setCatName] = useState("");
  const [srv, setSrv] = useState({ name: "", price: "", duration: "45", categoryId: "" });
  const [dayOff, setDayOff] = useState({ date: "", reason: "" });

  async function run(fn: () => PromiseLike<{ error: unknown }>, ok: string, k: string) {
    const { error } = await fn();
    if (error) {
      toast.error(translateError(error));
      return;
    }
    toast.success(ok);
    refetch(k);
  }

  return (
    <div className="space-y-6">
      {/* Categories */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-semibold">Kategoritë e shërbimeve</h3>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label htmlFor="cc-name">Emri i kategorisë</Label>
            <Input id="cc-name" value={catName} onChange={(e) => setCatName(e.target.value)} />
          </div>
          <Button
            disabled={catName.trim().length < 2}
            onClick={() =>
              void run(
                async () => {
                  const res = await supabase.from("clinic_service_categories").insert({
                    clinic_id: clinicId,
                    name: catName.trim(),
                    sort_order: categories?.length ?? 0,
                  });
                  setCatName("");
                  return res;
                },
                "Kategoria u shtua.",
                "categories",
              )
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Shto
          </Button>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {(categories ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-medium">{c.name}</span>
              <div className="flex items-center gap-3">
                <Switch
                  checked={c.active}
                  onCheckedChange={(v) =>
                    void run(
                      () => supabase.from("clinic_service_categories").update({ active: v }).eq("id", c.id),
                      "U përditësua.",
                      "categories",
                    )
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    void run(
                      () => supabase.from("clinic_service_categories").delete().eq("id", c.id),
                      "Kategoria u fshi.",
                      "categories",
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
          {!categories?.length ? <p className="py-2 text-sm text-muted-foreground">Ende pa kategori.</p> : null}
        </ul>
      </div>

      {/* Services */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-semibold">Shërbimet dhe çmimet</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="cs-name">Emri</Label>
            <Input id="cs-name" value={srv.name} onChange={(e) => setSrv({ ...srv, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cs-price">Çmimi (EUR)</Label>
            <Input id="cs-price" type="number" min="0" value={srv.price} onChange={(e) => setSrv({ ...srv, price: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cs-dur">Kohëzgjatja (min)</Label>
            <Input id="cs-dur" type="number" min="5" value={srv.duration} onChange={(e) => setSrv({ ...srv, duration: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Kategoria</Label>
            <Select value={srv.categoryId} onValueChange={(v) => setSrv({ ...srv, categoryId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Pa kategori" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          className="mt-3"
          disabled={srv.name.trim().length < 2 || !srv.price}
          onClick={() =>
            void run(
              async () => {
                const res = await supabase.from("clinic_services").insert({
                  clinic_id: clinicId,
                  name: srv.name.trim(),
                  price: Number(srv.price),
                  duration_minutes: Number(srv.duration) || 45,
                  category_id: srv.categoryId || null,
                });
                setSrv({ name: "", price: "", duration: "45", categoryId: "" });
                return res;
              },
              "Shërbimi u shtua.",
              "services",
            )
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Shto shërbimin
        </Button>
        <ul className="mt-4 divide-y divide-border">
          {(services ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatPrice(Number(s.price))} · {s.duration_minutes} min
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={s.active}
                  onCheckedChange={(v) =>
                    void run(() => supabase.from("clinic_services").update({ active: v }).eq("id", s.id), "U përditësua.", "services")
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void run(() => supabase.from("clinic_services").delete().eq("id", s.id), "Shërbimi u fshi.", "services")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
          {!services?.length ? <p className="py-2 text-sm text-muted-foreground">Ende pa shërbime.</p> : null}
        </ul>
      </div>

      {/* Working hours */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-semibold">Orari i punës</h3>
        <div className="mt-3 space-y-2">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const row = (hours ?? []).find((h) => h.day_of_week === d);
            return (
              <div key={d} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm font-medium">{DAYS_SQ[d]}</span>
                <Switch
                  checked={Boolean(row?.active)}
                  onCheckedChange={(v) =>
                    void run(
                      () =>
                        row
                          ? supabase.from("clinic_working_hours").update({ active: v }).eq("id", row.id)
                          : supabase.from("clinic_working_hours").insert({
                              clinic_id: clinicId,
                              day_of_week: d,
                              start_time: "09:00",
                              end_time: "17:00",
                              active: v,
                            }),
                      "Orari u ruajt.",
                      "hours",
                    )
                  }
                />
                <Input
                  type="time"
                  className="w-32"
                  value={row?.start_time?.slice(0, 5) ?? "09:00"}
                  disabled={!row}
                  onChange={(e) =>
                    row &&
                    void run(
                      () => supabase.from("clinic_working_hours").update({ start_time: e.target.value }).eq("id", row.id),
                      "Orari u ruajt.",
                      "hours",
                    )
                  }
                />
                <Input
                  type="time"
                  className="w-32"
                  value={row?.end_time?.slice(0, 5) ?? "17:00"}
                  disabled={!row}
                  onChange={(e) =>
                    row &&
                    void run(
                      () => supabase.from("clinic_working_hours").update({ end_time: e.target.value }).eq("id", row.id),
                      "Orari u ruajt.",
                      "hours",
                    )
                  }
                />
              </div>
            );
          })}
        </div>

        <h4 className="mt-6 font-semibold">Ditët e mbyllura</h4>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="cd-date">Data</Label>
            <Input id="cd-date" type="date" value={dayOff.date} onChange={(e) => setDayOff({ ...dayOff, date: e.target.value })} />
          </div>
          <div className="min-w-40 flex-1">
            <Label htmlFor="cd-reason">Arsyeja (opsionale)</Label>
            <Input id="cd-reason" value={dayOff.reason} onChange={(e) => setDayOff({ ...dayOff, reason: e.target.value })} />
          </div>
          <Button
            disabled={!dayOff.date}
            onClick={() =>
              void run(
                async () => {
                  const res = await supabase.from("clinic_days_off").insert({
                    clinic_id: clinicId,
                    date: dayOff.date,
                    reason: dayOff.reason || null,
                  });
                  setDayOff({ date: "", reason: "" });
                  return res;
                },
                "Dita e mbyllur u shtua.",
                "daysoff",
              )
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Shto
          </Button>
        </div>
        <ul className="mt-3 divide-y divide-border">
          {(daysOff ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {formatDate(d.date)}
                {d.reason ? ` · ${d.reason}` : ""}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void run(() => supabase.from("clinic_days_off").delete().eq("id", d.id), "U fshi.", "daysoff")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {!daysOff?.length ? <p className="py-2 text-sm text-muted-foreground">Nuk ka ditë të mbyllura.</p> : null}
        </ul>
      </div>

      <GalleryManager ownerType="CLINIC" ownerId={clinicId} ownerName={clinicName} />
    </div>
  );
}
