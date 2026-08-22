import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LogOut } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { ProfileTab } from "@/components/panel/ProfileTab";
import { CreateProfileForm } from "@/components/panel/CreateProfileForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ClinicWorkspace } from "@/components/clinic/ClinicWorkspace";

export const Route = createFileRoute("/paneli")({
  head: () => ({
    meta: [
      { title: "Paneli i klinikës | PhysioPlus" },
      {
        name: "description",
        content: "Menaxho klinikën, ekipin, shërbimet dhe terminet.",
      },
      { property: "og:title", content: "Paneli i klinikës | PhysioPlus" },
      { property: "og:description", content: "Menaxho klinikën dhe aktivitetin e përditshëm." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClinicWorkspace,
});

export function PhysioPanel() {
  const { user, loading, isPhysio, physioId, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/hyr", replace: true });
    else if (!loading && user && !isPhysio) void navigate({ to: "/", replace: true });
  }, [user, loading, isPhysio, navigate]);

  const { data: physio, isLoading } = useQuery({
    queryKey: ["my-physio", physioId],
    enabled: Boolean(physioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physiotherapists")
        .select("id,first_name,last_name,slug")
        .eq("id", physioId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    void navigate({ to: "/hyr", replace: true });
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl px-4 py-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Profili profesional</h1>
            {physio ? (
              <p className="mt-2 text-muted-foreground">
                {physio.first_name} {physio.last_name} ·{" "}
                <Link
                  to="/$slug"
                  params={{ slug: physio.slug }}
                  className="text-primary hover:underline"
                >
                  Shiko profilin publik
                </Link>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/klinika">
                <Building2 className="h-4 w-4" />
                Paneli i klinikës
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleSignOut()}>
              <LogOut className="h-4 w-4" />
              Dil
            </Button>
          </div>
        </div>

        {isLoading || loading ? (
          <p className="mt-8 text-muted-foreground">Profili po ngarkohet...</p>
        ) : physio ? (
          <div className="mt-8">
            <ProfileTab physioId={physio.id} />
          </div>
        ) : user ? (
          <>
            <p className="mt-8 text-muted-foreground">
              Nuk ke ende profil profesional. Plotëso të dhënat për ta krijuar.
            </p>
            <CreateProfileForm
              defaults={{
                firstName: (user.user_metadata?.["first_name"] as string) ?? "",
                lastName: (user.user_metadata?.["last_name"] as string) ?? "",
                phone: (user.user_metadata?.["phone"] as string) ?? "",
              }}
              onCreated={async () => {
                await refresh();
                await queryClient.invalidateQueries();
              }}
            />
          </>
        ) : null}
      </div>
    </SiteLayout>
  );
}
