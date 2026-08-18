import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploadField } from "@/components/panel/ImageUploadField";
import { GalleryManager } from "@/components/panel/GalleryManager";
import { supabase } from "@/integrations/supabase/client";
import { fetchRegions, fetchSpecializations } from "@/lib/queries";
import { translateError } from "@/lib/labels";
import { cn } from "@/lib/utils";

const schema = z.object({
  firstName: z.string().trim().min(2, "Emri duhet të ketë së paku 2 shkronja").max(60),
  lastName: z.string().trim().min(2, "Mbiemri duhet të ketë së paku 2 shkronja").max(60),
  professionalTitle: z.string().trim().max(120),
  phone: z.string().trim().max(30),
  address: z.string().trim().max(200),
  bio: z.string().trim().max(2000),
  education: z.string().trim().max(1500),
  experience: z.string().trim().max(1500),
  certifications: z.string().trim().max(1500),
});

type FormState = z.infer<typeof schema> & {
  slug: string;
  regionId: string;
  cityId: string;
  photoUrl: string | null;
};

export function useMyPhysioFull(physioId: string) {
  return useQuery({
    queryKey: ["my-physio-full", physioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physiotherapists")
        .select(
          "id, slug, first_name, last_name, professional_title, address, bio, education, experience, certifications, photo_url, region_id, city_id, physiotherapist_specializations(specialization_id)",
        )
        .eq("id", physioId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // phone is a restricted column: read it through the owner/admin RPC
      const { data: priv } = await supabase.rpc("get_physio_private", { _physio_id: physioId });
      const phone = Array.isArray(priv) ? (priv[0]?.phone ?? "") : "";
      return { ...data, phone };
    },
  });
}

export function ProfileTab({ physioId }: { physioId: string }) {
  const qc = useQueryClient();
  const { data: physio, isLoading, error: loadError } = useMyPhysioFull(physioId);

  useEffect(() => {
    if (loadError) toast.error(translateError(loadError));
  }, [loadError]);
  const { data: regions = [] } = useQuery({ queryKey: ["regions"], queryFn: fetchRegions });
  const { data: specializations = [] } = useQuery({
    queryKey: ["specializations"],
    queryFn: fetchSpecializations,
  });

  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    professionalTitle: "",
    phone: "",
    address: "",
    bio: "",
    education: "",
    experience: "",
    certifications: "",
    slug: "",
    regionId: "",
    cityId: "",
    photoUrl: null,
  });
  const [specIds, setSpecIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!physio) return;
    setForm({
      firstName: physio.first_name ?? "",
      slug: physio.slug ?? "",
      lastName: physio.last_name ?? "",
      professionalTitle: physio.professional_title ?? "",
      phone: physio.phone ?? "",
      address: physio.address ?? "",
      bio: physio.bio ?? "",
      education: physio.education ?? "",
      experience: physio.experience ?? "",
      certifications: physio.certifications ?? "",
      regionId: physio.region_id ?? "",
      cityId: physio.city_id ?? "",
      photoUrl: physio.photo_url,
    });
    setSpecIds((physio.physiotherapist_specializations ?? []).map((s) => s.specialization_id));
  }, [physio]);

  const cities = useMemo(
    () => regions.find((r) => r.id === form.regionId)?.cities ?? [],
    [regions, form.regionId],
  );

  function toggleSpec(id: string) {
    setSpecIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[String(i.path[0])] = i.message;
      setErrors(f);
      toast.error("Kontrollo fushat e shënuara.");
      return;
    }
    setErrors({});
    setBusy(true);
    const d = parsed.data;

    const desiredSlug = form.slug.trim().toLowerCase();
    if (desiredSlug && desiredSlug !== (physio?.slug ?? "")) {
      const { error: slugErr } = await supabase.rpc("set_my_physio_slug", { _slug: desiredSlug } as never);
      if (slugErr) {
        setBusy(false);
        const m = slugErr.message.includes("SLUG_TAKEN")
          ? "Kjo adresë është e zënë. Zgjidh një tjetër."
          : slugErr.message.includes("SLUG_RESERVED")
            ? "Kjo adresë është e rezervuar nga sistemi."
            : slugErr.message.includes("SLUG_INVALID")
              ? "Adresa duhet të ketë 3–60 shkronja/numra (vetëm shkronja të vogla dhe vizë)."
              : translateError(slugErr);
        setErrors({ slug: m });
        toast.error(m);
        return;
      }
    }

    const { error } = await supabase
      .from("physiotherapists")
      .update({
        first_name: d.firstName,
        last_name: d.lastName,
        professional_title: d.professionalTitle || null,
        phone: d.phone || null,
        address: d.address || null,
        bio: d.bio || null,
        education: d.education || null,
        experience: d.experience || null,
        certifications: d.certifications || null,
        photo_url: form.photoUrl,
        region_id: form.regionId || null,
        city_id: form.cityId || null,
      })
      .eq("id", physioId);

    if (error) {
      setBusy(false);
      toast.error(translateError(error));
      return;
    }

    const existing = (physio?.physiotherapist_specializations ?? []).map((s) => s.specialization_id);
    const toAdd = specIds.filter((id) => !existing.includes(id));
    const toRemove = existing.filter((id) => !specIds.includes(id));
    if (toRemove.length) {
      const { error: delErr } = await supabase
        .from("physiotherapist_specializations")
        .delete()
        .eq("physiotherapist_id", physioId)
        .in("specialization_id", toRemove);
      if (delErr) toast.error(translateError(delErr));
    }
    if (toAdd.length) {
      const { error: insErr } = await supabase.from("physiotherapist_specializations").insert(
        toAdd.map((id) => ({ physiotherapist_id: physioId, specialization_id: id })),
      );
      if (insErr) toast.error(translateError(insErr));
    }

    setBusy(false);
    toast.success("Profili u ruajt.");
    void qc.invalidateQueries({ queryKey: ["my-physio-full", physioId] });
    void qc.invalidateQueries({ queryKey: ["my-physio"] });
    void qc.invalidateQueries({ queryKey: ["my-physio-private", physioId] });
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Po ngarkohet...</p>;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="w-full sm:w-56">
            <ImageUploadField
              label="Fotoja e profilit"
              value={form.photoUrl}
              folder={`physio/${physioId}`}
              aspect="aspect-square"
              onChange={(url) => setForm((f) => ({ ...f, photoUrl: url }))}
            />
          </div>
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <Field id="firstName" label="Emri" v={form.firstName} e={errors["firstName"]} on={(x) => setForm({ ...form, firstName: x })} />
            <Field id="lastName" label="Mbiemri" v={form.lastName} e={errors["lastName"]} on={(x) => setForm({ ...form, lastName: x })} />
            <Field
              id="professionalTitle"
              label="Titulli profesional"
              v={form.professionalTitle}
              e={errors["professionalTitle"]}
              on={(x) => setForm({ ...form, professionalTitle: x })}
            />
            <Field id="phone" label="Telefoni" v={form.phone} e={errors["phone"]} on={(x) => setForm({ ...form, phone: x })} />
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl border border-dashed border-border p-4">
          <Label htmlFor="slug">Adresa publike (emri pas /)</Label>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">physioplus.com/</span>
            <Input
              id="slug"
              value={form.slug}
              maxLength={60}
              placeholder="emri-yt"
              onChange={(e) =>
                setForm({
                  ...form,
                  slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
                })
              }
            />
          </div>
          {errors["slug"] ? (
            <p className="text-xs text-destructive">{errors["slug"]}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Vetëm shkronja të vogla, numra dhe vizë (-). Duhet të jetë unike.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Regjioni</Label>
            <Select value={form.regionId} onValueChange={(v) => setForm({ ...form, regionId: v, cityId: "" })}>
              <SelectTrigger>
                <SelectValue placeholder="Zgjidh regjionin" />
              </SelectTrigger>
              <SelectContent>
                {regions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Qyteti</Label>
            <Select value={form.cityId} onValueChange={(v) => setForm({ ...form, cityId: v })} disabled={!form.regionId}>
              <SelectTrigger>
                <SelectValue placeholder="Zgjidh qytetin" />
              </SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field id="address" label="Adresa" v={form.address} e={errors["address"]} on={(x) => setForm({ ...form, address: x })} />
        </div>

        <div className="space-y-1.5">
          <Label>Specializimet</Label>
          <div className="flex flex-wrap gap-2">
            {specializations.map((s) => {
              const active = specIds.includes(s.id);
              return (
                <button key={s.id} type="button" onClick={() => toggleSpec(s.id)}>
                  <Badge
                    variant={active ? "default" : "secondary"}
                    className={cn("cursor-pointer px-3 py-1 text-sm font-normal", !active && "opacity-70")}
                  >
                    {s.name}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        <TextField id="bio" label="Rreth meje" rows={5} v={form.bio} max={2000} on={(x) => setForm({ ...form, bio: x })} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id="experience" label="Përvoja" rows={4} v={form.experience} max={1500} on={(x) => setForm({ ...form, experience: x })} />
          <TextField id="education" label="Arsimi" rows={4} v={form.education} max={1500} on={(x) => setForm({ ...form, education: x })} />
          <TextField
            id="certifications"
            label="Certifikimet"
            rows={4}
            v={form.certifications}
            max={1500}
            on={(x) => setForm({ ...form, certifications: x })}
          />
        </div>

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Ruaj ndryshimet
        </Button>
      </form>

      <GalleryManager
        ownerType="PHYSIOTHERAPIST"
        ownerId={physioId}
        ownerName={`${form.firstName} ${form.lastName}`.trim() || "Fizioterapeut"}
      />
    </div>
  );
}

function Field({
  id,
  label,
  v,
  on,
  e,
}: {
  id: string;
  label: string;
  v: string;
  on: (x: string) => void;
  e?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={v} maxLength={255} onChange={(ev) => on(ev.target.value)} />
      {e ? <p className="text-sm text-destructive">{e}</p> : null}
    </div>
  );
}

function TextField({
  id,
  label,
  v,
  on,
  rows,
  max,
}: {
  id: string;
  label: string;
  v: string;
  on: (x: string) => void;
  rows: number;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={v} rows={rows} maxLength={max} onChange={(ev) => on(ev.target.value)} />
    </div>
  );
}
