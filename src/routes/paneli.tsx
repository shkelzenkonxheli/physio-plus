import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Images, Pencil } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoriesTab, useCategories } from "@/components/panel/CategoriesTab";
import { ServicesTab, useServices } from "@/components/panel/ServicesTab";
import { HoursTab, useWorkingHours } from "@/components/panel/HoursTab";
import { CalendarTab } from "@/components/panel/CalendarTab";
import { ProfileChecklist } from "@/components/panel/ProfileChecklist";
import { ProfileTab } from "@/components/panel/ProfileTab";
import { CreateProfileForm } from "@/components/panel/CreateProfileForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  APPOINTMENT_STATUS_CLASS,
  APPOINTMENT_STATUS_SQ,
  translateError,
  type AppointmentStatus,
  type ProfileStatus,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/paneli")({
  head: () => ({
    meta: [
      { title: "Paneli i fizioterapeutit | PhysioPlus" },
      { name: "description", content: "Menaxho terminet, shërbimet dhe profilin tënd profesional." },
      { property: "og:title", content: "Paneli i fizioterapeutit | PhysioPlus" },
      { property: "og:description", content: "Menaxho terminet dhe profilin tënd." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PhysioPanel,
});

function PhysioPanel() {
  const { user, loading, physioId, refresh } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("terminet");

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/hyr", replace: true });
  }, [user, loading, navigate]);

  const { data: physio } = useQuery({
    queryKey: ["my-physio", physioId],
    enabled: Boolean(physioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physiotherapists")
        .select("id, first_name, last_name, slug, status, bio, photo_url, physiotherapist_specializations(specialization_id)")
        .eq("id", physioId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: privateInfo } = useQuery({
    queryKey: ["my-physio-private", physioId],
    enabled: Boolean(physioId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_physio_private", { _physio_id: physioId as string } as never);
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as { phone: string | null } | null;
    },
  });

  const { data: categories } = useCategories(physioId);
  const { data: services } = useServices(physioId);
  const { data: hours } = useWorkingHours(physioId);

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["physio-appointments", physioId],
    enabled: Boolean(physioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_at, status, price, service_name, client_first_name, client_last_name, client_phone")
        .eq("physiotherapist_id", physioId as string)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function setStatus(id: string, status: AppointmentStatus) {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) {
      toast.error(translateError(error));
      return;
    }
    toast.success("Statusi u përditësua.");
    void qc.invalidateQueries({ queryKey: ["physio-appointments", physioId] });
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl px-4 py-14">
        <h1 className="text-3xl font-bold">Paneli i fizioterapeutit</h1>
        {physio ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-muted-foreground">
              {physio.first_name} {physio.last_name} ·{" "}
              <Link to="/$slug" params={{ slug: physio.slug }} className="text-primary hover:underline">
                Shiko profilin publik
              </Link>
            </p>
            <Button type="button" onClick={() => setActiveTab("profili")}>
              <Pencil className="h-4 w-4" />
              Edito profilin & galerinë
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-muted-foreground">
              Nuk ke ende profil profesional. Plotëso të dhënat më poshtë për ta krijuar.
            </p>
            {!loading && user ? (
              <CreateProfileForm
                defaults={{
                  firstName: (user.user_metadata?.["first_name"] as string) ?? "",
                  lastName: (user.user_metadata?.["last_name"] as string) ?? "",
                  phone: (user.user_metadata?.["phone"] as string) ?? "",
                }}
                onCreated={async () => {
                  await refresh();
                  await qc.invalidateQueries();
                }}
              />
            ) : null}
          </>
        )}

        {physio ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
            <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1 [-webkit-overflow-scrolling:touch]">
              <TabsTrigger value="terminet" className="shrink-0 whitespace-nowrap">Terminet</TabsTrigger>
              <TabsTrigger value="kalendari" className="shrink-0 whitespace-nowrap">Kalendari</TabsTrigger>
              <TabsTrigger value="kategorite" className="shrink-0 whitespace-nowrap">Kategoritë</TabsTrigger>
              <TabsTrigger value="sherbimet" className="shrink-0 whitespace-nowrap">Shërbimet</TabsTrigger>
              <TabsTrigger value="orari" className="shrink-0 whitespace-nowrap">Orari & ditët e lira</TabsTrigger>
              <TabsTrigger value="profili" className="shrink-0 gap-2 whitespace-nowrap">
                <Images className="h-4 w-4" />
                Profili & galeria
              </TabsTrigger>
            </TabsList>

            <TabsContent value="kategorite" className="mt-6">
              <CategoriesTab physioId={physio.id} />
            </TabsContent>
            <TabsContent value="kalendari" className="mt-6">
              <CalendarTab physioId={physio.id} />
            </TabsContent>
            <TabsContent value="sherbimet" className="mt-6">
              <ServicesTab physioId={physio.id} />
            </TabsContent>
            <TabsContent value="orari" className="mt-6">
              <HoursTab physioId={physio.id} />
            </TabsContent>
            <TabsContent value="profili" className="mt-6">
              <div className="space-y-6">
              <ProfileChecklist
                physioId={physio.id}
                status={physio.status as ProfileStatus}
                hasBio={Boolean(physio.bio && physio.bio.length > 30)}
                hasPhoto={Boolean(physio.photo_url)}
                hasContact={Boolean(privateInfo?.phone)}
                hasSpecializations={(physio.physiotherapist_specializations ?? []).length > 0}
                categories={categories?.length ?? 0}
                services={services?.length ?? 0}
                workingDays={(hours ?? []).filter((h) => h.active).length}
              />
              <ProfileTab physioId={physio.id} />
              </div>
            </TabsContent>

            <TabsContent value="terminet" className="mt-6">
        {isLoading ? (
          <Skeleton className="mt-4 h-24 rounded-2xl" />
        ) : appointments && appointments.length ? (
          <div className="mt-4 space-y-3">
            {appointments.map((a) => (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {a.client_first_name} {a.client_last_name}
                  </p>
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      APPOINTMENT_STATUS_CLASS[a.status as AppointmentStatus],
                    )}
                  >
                    {APPOINTMENT_STATUS_SQ[a.status as AppointmentStatus]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {a.service_name} · {formatDateTime(a.start_at)} · {formatPrice(a.price)} ·{" "}
                  {a.client_phone}
                </p>
                {a.status === "PENDING" ? (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => void setStatus(a.id, "CONFIRMED")}>
                      Konfirmo
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void setStatus(a.id, "REJECTED")}>
                      Refuzo
                    </Button>
                  </div>
                ) : a.status === "CONFIRMED" ? (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void setStatus(a.id, "COMPLETED")}>
                      Shëno si i përfunduar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void setStatus(a.id, "NO_SHOW")}>
                      Nuk u paraqit
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            Ende nuk ke termine.
          </p>
        )}
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </SiteLayout>
  );
}