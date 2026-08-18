import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploadField } from "@/components/panel/ImageUploadField";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/labels";

export type ClinicRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  phone2: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  header_image_url: string | null;
  active: boolean;
  city_id: string | null;
};

const empty = {
  name: "",
  slug: "",
  description: "",
  address: "",
  phone: "",
  phone2: "",
  whatsapp: "",
  email: "",
  website: "",
  cityId: "",
  active: true,
};

export function ClinicForm({
  cities,
  clinic,
  onDone,
  onCancel,
}: {
  cities: { id: string; name: string }[];
  clinic?: ClinicRow | undefined;
  onDone: () => void;
  onCancel?: (() => void) | undefined;
}) {
  const [form, setForm] = useState(
    clinic
      ? {
          name: clinic.name,
          slug: clinic.slug,
          description: clinic.description ?? "",
          address: clinic.address ?? "",
          phone: clinic.phone ?? "",
          phone2: clinic.phone2 ?? "",
          whatsapp: clinic.whatsapp ?? "",
          email: clinic.email ?? "",
          website: clinic.website ?? "",
          cityId: clinic.city_id ?? "",
          active: clinic.active,
        }
      : empty,
  );
  const [logo, setLogo] = useState<string | null>(clinic?.logo_url ?? null);
  const [header, setHeader] = useState<string | null>(clinic?.header_image_url ?? null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof empty, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (form.name.trim().length < 2) {
      toast.error("Emri i klinikës duhet të ketë së paku 2 shkronja.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("admin_upsert_clinic", {
      _id: clinic?.id ?? null,
      _name: form.name.trim(),
      _city_id: form.cityId || null,
      _address: form.address || null,
      _phone: form.phone || null,
      _email: form.email || null,
      _active: form.active,
      _slug: form.slug.trim() || null,
      _description: form.description || null,
      _logo_url: logo,
      _header_image_url: header,
      _website: form.website || null,
      _phone2: form.phone2 || null,
      _whatsapp: form.whatsapp || null,
    } as never);
    setBusy(false);
    if (error) {
      const msg = error.message.includes("SLUG_TAKEN")
        ? "Kjo adresë (slug) është e zënë. Zgjidh një tjetër."
        : translateError(error);
      toast.error(msg);
      return;
    }
    toast.success(clinic ? "Klinika u përditësua." : "Klinika u shtua.");
    if (!clinic) {
      setForm(empty);
      setLogo(null);
      setHeader(null);
    }
    onDone();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="font-semibold">{clinic ? `Redakto: ${clinic.name}` : "Shto klinikë terapeutike"}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id="c-name" label="Emri i klinikës" value={form.name} onChange={(v) => set("name", v)} />
        <Field
          id="c-slug"
          label="Adresa publike (slug)"
          value={form.slug}
          onChange={(v) => set("slug", v)}
          placeholder="p.sh. klinika-shendeti"
        />
        <div>
          <Label>Qyteti</Label>
          <Select value={form.cityId} onValueChange={(v) => set("cityId", v)}>
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
        <Field id="c-address" label="Adresa" value={form.address} onChange={(v) => set("address", v)} />
        <Field id="c-phone" label="Telefoni" value={form.phone} onChange={(v) => set("phone", v)} />
        <Field id="c-phone2" label="Telefon shtesë" value={form.phone2} onChange={(v) => set("phone2", v)} />
        <Field id="c-wa" label="WhatsApp" value={form.whatsapp} onChange={(v) => set("whatsapp", v)} />
        <Field id="c-email" label="Email" value={form.email} onChange={(v) => set("email", v)} />
        <Field id="c-web" label="Ueb-faqja" value={form.website} onChange={(v) => set("website", v)} placeholder="https://" />
      </div>

      <div className="mt-4">
        <Label htmlFor="c-desc">Përshkrimi</Label>
        <Textarea
          id="c-desc"
          rows={4}
          value={form.description}
          maxLength={2000}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ImageUploadField
          label="Logo e klinikës"
          value={logo}
          folder="clinics/logo"
          aspect="aspect-square"
          onChange={setLogo}
        />
        <ImageUploadField
          label="Fotoja kryesore (header)"
          value={header}
          folder="clinics/header"
          onChange={setHeader}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Switch id="c-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
        <Label htmlFor="c-active">Klinika është aktive dhe publike</Label>
      </div>

      <div className="mt-4 flex gap-2">
        <Button disabled={busy} onClick={() => void submit()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {clinic ? "Ruaj ndryshimet" : "Shto klinikën"}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Anulo
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} maxLength={255} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
