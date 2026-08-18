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

export const Route = createFileRoute("/hyr")({
  head: () => ({
    meta: [
      { title: "Kyçu në llogarinë tënde | PhysioPlus" },
      {
        name: "description",
        content: "Kyçu në PhysioPlus për t'i menaxhuar terminet dhe profilin tënd.",
      },
      { property: "og:title", content: "Kyçu | PhysioPlus" },
      { property: "og:description", content: "Kyçu në llogarinë tënde në PhysioPlus." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Email-i nuk është i vlefshëm").max(255),
  password: z.string().min(6, "Fjalëkalimi duhet të ketë së paku 6 karaktere").max(72),
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, isAdmin, isPhysio, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    void navigate({ to: isAdmin ? "/admin" : isPhysio ? "/paneli" : "/llogaria", replace: true });
  }, [user, loading, isAdmin, isPhysio, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[String(i.path[0])] = i.message;
      setErrors(f);
      return;
    }
    setErrors({});
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) {
      toast.error(translateError(error));
      return;
    }
    toast.success("Mirë se u ktheve!");
  }

  async function google() {
    const { lovable } = await import("@/integrations/lovable/index");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Kyçja me Google dështoi. Provo përsëri.");
      return;
    }
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
          <h1 className="text-2xl font-bold">Kyçu</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mirë se erdhe përsëri në PhysioPlus.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                maxLength={255}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors["email"] ? (
                <p className="text-sm text-destructive">{errors["email"]}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Fjalëkalimi</Label>
              <Input
                id="password"
                type="password"
                value={password}
                maxLength={72}
                onChange={(e) => setPassword(e.target.value)}
              />
              {errors["password"] ? (
                <p className="text-sm text-destructive">{errors["password"]}</p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Kyçu
            </Button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ose <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" size="lg" onClick={() => void google()}>
            Vazhdo me Google
          </Button>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Nuk ke llogari?{" "}
            <Link to="/regjistrohu" className="font-medium text-primary hover:underline">
              Regjistrohu
            </Link>
          </p>
        </div>
      </div>
    </SiteLayout>
  );
}