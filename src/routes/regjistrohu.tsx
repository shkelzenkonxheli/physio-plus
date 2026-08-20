import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/labels";
import { useAuth } from "@/lib/auth";

type SignupSearch = { invite?: string | undefined };
export const Route = createFileRoute("/regjistrohu")({
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    invite: typeof search["invite"] === "string" ? search["invite"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Krijo llogari klienti | PhysioPlus" },
      {
        name: "description",
        content:
          "Regjistrohu falas në PhysioPlus për të rezervuar dhe menaxhuar terminet e fizioterapisë.",
      },
      { property: "og:title", content: "Krijo llogari | PhysioPlus" },
      { property: "og:description", content: "Regjistrohu falas dhe rezervo terminin tënd." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignupPage,
});

const schema = z
  .object({
    firstName: z.string().trim().min(2, "Emri duhet të ketë së paku 2 shkronja").max(60),
    lastName: z.string().trim().min(2, "Mbiemri duhet të ketë së paku 2 shkronja").max(60),
    email: z.string().trim().email("Email-i nuk është i vlefshëm").max(255),
    phone: z.string().trim().max(30).optional(),
    password: z.string().min(8, "Fjalëkalimi duhet të ketë së paku 8 karaktere").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Fjalëkalimet nuk përputhen",
    path: ["confirm"],
  });

function SignupPage() {
  const { invite } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user)
      void navigate({
        to: invite ? "/hyr" : "/llogaria",
        search: invite ? { invite } : {},
        replace: true,
      });
  }, [user, loading, navigate, invite]);

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
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: invite
          ? `${window.location.origin}/hyr?invite=${encodeURIComponent(invite)}`
          : `${window.location.origin}/llogaria`,
        data: {
          first_name: parsed.data.firstName,
          last_name: parsed.data.lastName,
          phone: parsed.data.phone ?? "",
          role: "CLIENT",
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(translateError(error));
      return;
    }

    toast.success("Llogaria u krijua! Kontrollo email-in për konfirmim.");
  }

  async function google() {
    const { lovable } = await import("@/integrations/lovable/index");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: invite
        ? `${window.location.origin}/hyr?invite=${encodeURIComponent(invite)}`
        : window.location.origin,
    });
    if (result.error) toast.error("Regjistrimi me Google dështoi. Provo përsëri.");
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
          <h1 className="text-2xl font-bold">Krijo llogari</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rezervo dhe menaxho terminet e tua në një vend.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
            </div>
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
              label="Telefoni (opsional)"
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
              id="confirm"
              label="Konfirmo fjalëkalimin"
              type="password"
              v={form.confirm}
              e={errors["confirm"]}
              on={(x) => setForm({ ...form, confirm: x })}
            />
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Regjistrohu
            </Button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ose{" "}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" size="lg" onClick={() => void google()}>
            Vazhdo me Google
          </Button>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ke llogari?{" "}
            <Link to="/hyr" className="font-medium text-primary hover:underline">
              Kyçu
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Je fizioterapeut?{" "}
            <Link
              to="/regjistrohu-fizioterapeut"
              className="font-medium text-primary hover:underline"
            >
              Regjistro profilin profesional
            </Link>
          </p>
        </div>
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
