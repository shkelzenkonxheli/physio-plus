import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import { APPOINTMENT_STATUS_CLASS, APPOINTMENT_STATUS_SQ, type AppointmentStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/llogaria/terminet")({
  head: () => ({
    meta: [
      { title: "Terminet e mia | PhysioPlus" },
      { name: "description", content: "Shiko dhe menaxho terminet e tua të fizioterapisë." },
      { property: "og:title", content: "Terminet e mia | PhysioPlus" },
      { property: "og:description", content: "Shiko dhe menaxho terminet e tua." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyAppointments,
});

function MyAppointments() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/hyr", replace: true });
  }, [user, loading, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-appointments", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, start_at, status, price, service_name, physiotherapists(first_name, last_name, slug)",
        )
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <SiteLayout>
      <div className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-3xl font-bold">Terminet e mia</h1>
        {isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : data && data.length ? (
          <div className="mt-6 space-y-3">
            {data.map((a) => (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{a.service_name}</p>
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
                  {a.physiotherapists
                    ? `${a.physiotherapists.first_name} ${a.physiotherapists.last_name} · `
                    : ""}
                  {formatDateTime(a.start_at)} · {formatPrice(a.price)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            Ende nuk ke termine.
          </p>
        )}
      </div>
    </SiteLayout>
  );
}