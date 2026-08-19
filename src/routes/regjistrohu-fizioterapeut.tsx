import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
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
import { useAuth } from "@/lib/auth";
import { PENDING_PHYSIO_KEY } from "@/components/panel/CreateProfileForm";

export const Route = createFileRoute("/regjistrohu-fizioterapeut")({
  head: () => ({
    meta: [
      { title: "Regjistrohu si fizioterapeut | PhysioPlus" },
      {
        name: "description",
        content:
          "Krijo profilin tënd profesional në PhysioPlus, prano rezervime online dhe rrit numrin e klientëve në Kosovë.",
      },
      { property: "og:title", content: "Regjistrohu si fizioterapeut | PhysioPlus" },
      {
        property: "og:description",
        content: "Krijo profilin profesional dhe prano rezervime online në Kosovë.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PhysioSignupPage,
});

const schema = z.object({
  firstName: z.string().trim().min(2, "Emri duhet të ketë së paku 2 shkronja").max(60),
  lastName: z.string().trim().min(2, "Mbiemri duhet të ketë së paku 2 shkronja").max(60),
  email: z.string().trim().email("Email-i nuk është i vlefshëm").max(255),
  phone: z.string().trim().min(6, "Numri i telefonit nuk është i vlefshëm").max(30),
  password: z.string().min(8, "Fjalëkalimi duhet të ketë së paku 8 karaktere").max(72),
  professionalTitle: z.string().trim().max(120).optional(),
  licenseNumber: z.string().trim().max(60).optional(),
  regionId: z.string().uuid("Zgjidh regjionin"),
  cityId: z.string().uuid("Zgjidh qytetin"),
  bio: z.string().trim().max(1500).optional(),
});

function PhysioSignupPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    professionalTitle: "",
    licenseNumber: "",
    regionId: "",
    cityId: "",
    bio: "",
  });

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
    window.localStorage.setItem(
      PENDING_PHYSIO_KEY,
      JSON.stringify({
        firstName: d.firstName,
        lastName: d.lastName,
        phone: d.phone,
        professionalTitle: d.professionalTitle ?? "",
        licenseNumber: d.licenseNumber ?? "",
        regionId: d.regionId,
        cityId: d.cityId,
        bio: d.bio ?? "",
      }),
    );
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: d.email,
      password: d.password,
      options: {
        emailRedirectTo: `${window.location.origin}/paneli`,
        data: {
          first_name: d.firstName,
          last_name: d.lastName,
          phone: d.phone,
          role: "PHYSIOTHERAPIST",
        },
      },
    });
    if (error) {
      setBusy(false);
      toast.error(translateError(error));
      return;
    }

    if (signUpData.session && signUpData.user) {
      const { error: insertError } = await supabase.rpc("create_my_physio_profile", {
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
      if (insertError) {
        toast.error(translateError(insertError));
        return;
      }
      await refresh();
      window.localStorage.removeItem(PENDING_PHYSIO_KEY);
      toast.success("Profili u krijua! Vazhdo me plotësimin e shërbimeve.");
      void navigate({ to: "/paneli" });
      return;
    }

    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
          <h1 className="mt-4 text-2xl font-bold">Konfirmo email-in</h1>
          <p className="mt-2 text-muted-foreground">
            Të dërguam një link konfirmimi. Pas konfirmimit, kyçu dhe plotëso profilin tënd
            profesional në panel.
          </p>
          <Button asChild className="mt-6">
            <Link to="/hyr">Shko te kyçja</Link>
          </Button>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-2xl px-4 py-14">
        <h1 className="text-3xl font-bold">Regjistrohu si fizioterapeut</h1>
        <p className="mt-2 text-muted-foreground">
          Krijo profilin, shto shërbimet dhe oraret, dhe prano rezervime online. Profili publikohet
          pas aprovimit nga ekipi i PhysioPlus.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-5 rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <F
              id="firstName"
              label="Emri"
              v={form.firstName}
              e={errors["firstName"]}
              on={(x) => setForm({ ...form, firstName: x })}
            />
            <F
              id="lastName"
              label="Mbiemri"
              v={form.lastName}
              e={errors["lastName"]}
              on={(x) => setForm({ ...form, lastName: x })}
            />
            <F
              id="email"
              label="Email"
              type="email"
              v={form.email}
              e={errors["email"]}
              on={(x) => setForm({ ...form, email: x })}
            />
            <F
              id="phone"
              label="Telefoni"
              v={form.phone}
              e={errors["phone"]}
              on={(x) => setForm({ ...form, phone: x })}
            />
            <F
              id="password"
              label="Fjalëkalimi"
              type="password"
              v={form.password}
              e={errors["password"]}
              on={(x) => setForm({ ...form, password: x })}
            />
            <F
              id="professionalTitle"
              label="Titulli profesional"
              v={form.professionalTitle}
              e={errors["professionalTitle"]}
              on={(x) => setForm({ ...form, professionalTitle: x })}
            />
            <F
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
              <Select
                value={form.regionId}
                onValueChange={(v) => setForm({ ...form, regionId: v, cityId: "" })}
              >
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
              {errors["regionId"] ? (
                <p className="text-sm text-destructive">{errors["regionId"]}</p>
              ) : null}
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
              {errors["cityId"] ? (
                <p className="text-sm text-destructive">{errors["cityId"]}</p>
              ) : null}
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
          <p className="text-center text-sm text-muted-foreground">
            Ke llogari?{" "}
            <Link to="/hyr" className="font-medium text-primary hover:underline">
              Kyçu
            </Link>
          </p>
        </form>
      </div>
    </SiteLayout>
  );
}

function F({
  id,
  label,
  v,
  on,
  e,
  type = "text",
}: {
  id: string;
  label: string;
  v: string;
  on: (x: string) => void;
  e?: string | undefined;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={v} maxLength={255} onChange={(ev) => on(ev.target.value)} />
      {e ? <p className="text-sm text-destructive">{e}</p> : null}
    </div>
  );
}
