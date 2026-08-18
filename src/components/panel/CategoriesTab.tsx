import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/labels";

export function useCategories(physioId: string | null) {
  return useQuery({
    queryKey: ["panel-categories", physioId],
    enabled: Boolean(physioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_categories")
        .select("id, name, description, active, sort_order")
        .eq("physiotherapist_id", physioId as string)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function CategoriesTab({ physioId }: { physioId: string }) {
  const qc = useQueryClient();
  const { data: categories, isLoading } = useCategories(physioId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["panel-categories", physioId] });
    void qc.invalidateQueries({ queryKey: ["panel-services", physioId] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (trimmed.length < 2) throw new Error("Emri i kategorisë duhet të ketë së paku 2 shkronja.");
      const { error } = await supabase.from("service_categories").insert({
        physiotherapist_id: physioId,
        name: trimmed,
        description: description.trim() || null,
        sort_order: (categories?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kategoria u ruajt.");
      setName("");
      setDescription("");
      invalidate();
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("service_categories").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kategoria u fshi.");
      invalidate();
    },
    onError: (e) => toast.error(translateError(e)),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-semibold">+ Shto kategori</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Emri i kategorisë</Label>
            <Input id="cat-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="p.sh. Fizioterapi" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Përshkrimi (opsional)</Label>
            <Textarea id="cat-desc" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <Button className="mt-4" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {create.isPending ? "Po ruhet..." : "Ruaj kategorinë"}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : categories && categories.length ? (
        <div className="space-y-3">
          {categories.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-card">
              <div>
                <p className="font-semibold">{c.name}</p>
                {c.description ? <p className="text-sm text-muted-foreground">{c.description}</p> : null}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={c.active} onCheckedChange={(v) => toggle.mutate({ id: c.id, active: v })} />
                  <span className="text-sm text-muted-foreground">{c.active ? "Aktive" : "Joaktive"}</span>
                </div>
                <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          Ende nuk ke kategori. Shto kategorinë e parë për të krijuar shërbime.
        </p>
      )}
    </div>
  );
}
