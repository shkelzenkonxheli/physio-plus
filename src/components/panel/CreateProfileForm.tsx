import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchRegions } from "@/lib/queries";
import { translateError } from "@/lib/labels";

export const PENDING_PHYSIO_KEY = "physioplus:pending-physio-profile";

const schema = z.object({
  firstName: z.string().trim().min(2, "Emri duhet të ketë së paku 2 shkronja").max(60),
  lastName: z.string().trim().min(2, "Mbiemri duhet të ketë së paku 2 shkronja").max(60),
  phone: z.string().trim().min(6, "Numri i telefonit nuk është i vlefshëm").max(30),
  professionalTitle: z.string().trim().max(120).optional(),
  licenseNumber: z.string().trim().max(60).optional(),
  regionId: z.string().uuid("Zgjidh regjionin"),
  cityId: z.string().uuid("Zgjidh qytetin"),
  bio: z.string().trim().max(1500).optional(),
});

export function CreateProfileForm({
  defaults,
  onCreated,
}: {
  defaults?: { firstName?: string; lastName?: string; phone?: string } | undefined;
  onCreated: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    professionalTitle: "",
    licenseNumber: "",
    regionId: "",
    cityId: "",
    bio: "",
  });

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(PENDING_PHYSIO_KEY) : null;
    const pending = stored ? (JSON.parse(stored) as Partial<typeof form>) : null;
    setForm((f) => ({
      ...f,
      ...(pending ?? {}),
      firstName: pending?.firstName || defaults?.firstName || f.firstName,
      lastName: pending?.lastName || defaults?.lastName || f.lastName,
      phone: pending?.phone || defaults?.phone || f.phone,
    }));
  }, [defaults?.firstName, defaults?.lastName, defaults?.phone]);

  const { data: regions = [] } = useQuery({ queryKey: ["regions"], queryFn: fetchRegions });
  const cities = useMemo(
    () => regions.find((r) => r.id === form.regionId)?.cities ?? [],
    [regions, form.regionId],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[String(i.path[0])] = i.message;
      setErrors(f);
      return;
    }
    setErrors({});
    setBusy(true);
    const d = parsed.data;
    const { error } = await supabase.rpc("create_my_physio_profile", {
      _first_name: d.firstName,
      _last_name: d.lastName,
      _phone: d.phone,
      _region_id: d.regionId,
      _city_id: d.cityId,
      _professional_title: d.professionalTitle || null,
      _license_number: d.licenseNumber || null,
      _bio: d.bio || null,
    } as never);
    setBusy(false);
    if (error) {
      toast.error(translateError(error));
      return;
    }
    window.localStorage.removeItem(PENDING_PHYSIO_KEY);
    toast.success("Profili u krijua! Plotëso shërbimet dhe orarin, pastaj dërgoje për aprovim.");
    await onCreated();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 space-y-5 rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8"
    >
      <div>
        <h2 className="text-xl font-semibold">Krijo profilin tënd profesional</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pas plotësimit, profili ruhet si draft dhe mund ta dërgosh për aprovim te administratori.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="Emri" v={form.firstName} e={errors["firstName"]} on={(x) => setForm({ ...form, firstName: x })} />
        <Field id="lastName" label="Mbiemri" v={form.lastName} e={errors["lastName"]} on={(x) => setForm({ ...form, lastName: x })} />
        <Field id="phone" label="Telefoni" v={form.phone} e={errors["phone"]} on={(x) => setForm({ ...form, phone: x })} />
        <Field
          id="professionalTitle"
          label="Titulli profesional"
          v={form.professionalTitle}
          e={errors["professionalTitle"]}
          on={(x) => setForm({ ...form, professionalTitle: x })}
        />
        <Field
          id="licenseNumber"
          label="Numri i licencës (opsional)"
          v={form.licenseNumber}
          e={errors["licenseNumber"]}
          on={(x) => setForm({ ...form, licenseNumber: x })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          {errors["regionId"] ? <p className="text-sm text-destructive">{errors["regionId"]}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label>Qyteti</Label>
          <Select
            value={form.cityId}
            onValueChange={(v) => setForm({ ...form, cityId: v })}
            disabled={!form.regionId}
          >
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
          {errors["cityId"] ? <p className="text-sm text-destructive">{errors["cityId"]}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bio">Përshkrimi i shkurtër</Label>
        <Textarea
          id="bio"
          value={form.bio}
          maxLength={1500}
          rows={5}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          placeholder="Trego për përvojën, qasjen dhe fushat e tua të ekspertizës."
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Krijo profilin
      </Button>
    </form>
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
