import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/labels";
import { formatDuration, formatPrice } from "@/lib/format";
import { useCategories } from "./CategoriesTab";

export function useServices(physioId: string | null) {
  return useQuery({
    queryKey: ["panel-services", physioId],
    enabled: Boolean(physioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, price, currency, duration_minutes, active, category_id, service_categories(name)")
        .eq("physiotherapist_id", physioId as string)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function ServicesTab({ physioId }: { physioId: string }) {
  const qc = useQueryClient();
  const { data: categories } = useCategories(physioId);
  const { data: services, isLoading } = useServices(physioId);
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    description: "",
    price: "",
    duration: "45",
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["panel-services", physioId] });

  const create = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const price = Number(form.price);
      const duration = Number(form.duration);
      if (name.length < 2) throw new Error("Emri i shërbimit duhet të ketë së paku 2 shkronja.");
      if (!form.categoryId) throw new Error("Zgjidh një kategori për shërbimin.");
      if (!Number.isFinite(price) || price < 0) throw new Error("Çmimi nuk është i vlefshëm.");
      if (!Number.isFinite(duration) || duration < 10 || duration > 480)
        throw new Error("Kohëzgjatja duhet të jetë mes 10 dhe 480 minuta.");
      const { error } = await supabase.from("services").insert({
        physiotherapist_id: physioId,
        category_id: form.categoryId,
        name,
        description: form.description.trim() || null,
        price,
        duration_minutes: duration,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shërbimi u ruajt.");
      setForm({ name: "", categoryId: "", description: "", price: "", duration: "45" });
      invalidate();
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("services").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shërbimi u fshi.");
      invalidate();
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const activeCategories = (categories ?? []).filter((c) => c.active);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    categoryId: "",
    description: "",
    price: "",
    duration: "",
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const name = editForm.name.trim();
      const price = Number(editForm.price);
      const duration = Number(editForm.duration);
      if (name.length < 2) throw new Error("Emri i shërbimit duhet të ketë së paku 2 shkronja.");
      if (!editForm.categoryId) throw new Error("Zgjidh një kategori për shërbimin.");
      if (!Number.isFinite(price) || price < 0) throw new Error("Çmimi nuk është i vlefshëm.");
      if (!Number.isFinite(duration) || duration < 10 || duration > 480)
        throw new Error("Kohëzgjatja duhet të jetë mes 10 dhe 480 minuta.");
      const { error } = await supabase
        .from("services")
        .update({
          name,
          category_id: editForm.categoryId,
          description: editForm.description.trim() || null,
          price,
          duration_minutes: duration,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shërbimi u përditësua.");
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error(translateError(e)),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-semibold">+ Shto shërbim</h3>
        {activeCategories.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Krijo së paku një kategori te skeda "Kategoritë" para se të shtosh shërbime.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="srv-name">Emri i shërbimit</Label>
                <Input id="srv-name" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="p.sh. Fizioterapi individuale" />
              </div>
              <div className="space-y-1.5">
                <Label>Kategoria</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger><SelectValue placeholder="Zgjidh kategorinë" /></SelectTrigger>
                  <SelectContent>
                    {activeCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-price">Çmimi (€)</Label>
                <Input id="srv-price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="25" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-dur">Kohëzgjatja (minuta)</Label>
                <Input id="srv-dur" inputMode="numeric" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="45" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="srv-desc">Përshkrimi (opsional)</Label>
                <Textarea id="srv-desc" rows={2} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <Button className="mt-4" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {create.isPending ? "Po ruhet..." : "Ruaj shërbimin"}
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : services && services.length ? (
        <div className="space-y-3">
          {services.map((s) =>
            editing === s.id ? (
              <div key={s.id} className="rounded-2xl border border-primary bg-card p-5 shadow-card">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`e-name-${s.id}`}>Emri i shërbimit</Label>
                    <Input
                      id={`e-name-${s.id}`}
                      value={editForm.name}
                      maxLength={100}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Kategoria</Label>
                    <Select
                      value={editForm.categoryId}
                      onValueChange={(v) => setEditForm({ ...editForm, categoryId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Zgjidh kategorinë" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`e-price-${s.id}`}>Çmimi (€)</Label>
                    <Input
                      id={`e-price-${s.id}`}
                      inputMode="decimal"
                      value={editForm.price}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`e-dur-${s.id}`}>Kohëzgjatja (minuta)</Label>
                    <Input
                      id={`e-dur-${s.id}`}
                      inputMode="numeric"
                      value={editForm.duration}
                      onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`e-desc-${s.id}`}>Përshkrimi (opsional)</Label>
                    <Textarea
                      id={`e-desc-${s.id}`}
                      rows={2}
                      maxLength={500}
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" disabled={update.isPending} onClick={() => update.mutate(s.id)}>
                    {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Ruaj ndryshimet
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                    <X className="mr-1 h-4 w-4" /> Anulo
                  </Button>
                </div>
              </div>
            ) : (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-card">
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {s.service_categories?.name ?? "Pa kategori"} · {formatPrice(s.price, s.currency)} ·{" "}
                  {formatDuration(s.duration_minutes)}
                </p>
                {s.description ? (
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">{s.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={s.active} onCheckedChange={(v) => toggle.mutate({ id: s.id, active: v })} />
                  <span className="text-sm text-muted-foreground">{s.active ? "Aktiv" : "Joaktiv"}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(s.id);
                    setEditForm({
                      name: s.name,
                      categoryId: s.category_id ?? "",
                      description: s.description ?? "",
                      price: String(s.price),
                      duration: String(s.duration_minutes),
                    });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(s.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            ),
          )}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          Ende nuk ke shërbime.
        </p>
      )}
    </div>
  );
}
