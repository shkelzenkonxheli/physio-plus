import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { translateError, APPOINTMENT_STATUS_SQ, type AppointmentStatus } from "@/lib/labels";
import { DAYS_SQ_SHORT, formatDate, formatTime, toDateKey } from "@/lib/format";
import { cn } from "@/lib/utils";

function startOfWeek(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

export function CalendarTab({ physioId }: { physioId: string }) {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    return d;
  }, [weekStart]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const rangeKey = weekStart.toISOString();

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["panel-calendar", physioId, rangeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_at, end_at, status, service_name, client_first_name, client_last_name")
        .eq("physiotherapist_id", physioId)
        .gte("start_at", weekStart.toISOString())
        .lt("start_at", weekEnd.toISOString())
        .order("start_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: blocked } = useQuery({
    queryKey: ["panel-blocked", physioId, rangeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_times")
        .select("id, start_at, end_at, reason")
        .eq("physiotherapist_id", physioId)
        .gte("start_at", weekStart.toISOString())
        .lt("start_at", weekEnd.toISOString())
        .order("start_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState({ date: toDateKey(new Date()), start: "09:00", end: "10:00", reason: "" });

  const addBlock = useMutation({
    mutationFn: async () => {
      const startAt = new Date(`${form.date}T${form.start}:00`);
      const endAt = new Date(`${form.date}T${form.end}:00`);
      if (endAt <= startAt) throw new Error("Ora e mbarimit duhet të jetë pas orës së fillimit.");
      const { error } = await supabase.from("blocked_times").insert({
        physiotherapist_id: physioId,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        reason: form.reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Koha u bllokua.");
      setForm((f) => ({ ...f, reason: "" }));
      void qc.invalidateQueries({ queryKey: ["panel-blocked", physioId] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const removeBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blocked_times").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bllokimi u hoq.");
      void qc.invalidateQueries({ queryKey: ["panel-blocked", physioId] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftWeek(-1)}>
            <ChevronLeft className="h-4 w-4" /> Java e kaluar
          </Button>
          <p className="text-sm font-semibold">
            {formatDate(days[0] as Date)} – {formatDate(days[6] as Date)}
          </p>
          <Button variant="outline" size="sm" onClick={() => shiftWeek(1)}>
            Java tjetër <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="mt-4 h-40 rounded-2xl" />
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-7">
            {days.map((d) => {
              const key = toDateKey(d);
              const dayAppts = (appointments ?? []).filter((a) => toDateKey(new Date(a.start_at)) === key);
              const dayBlocks = (blocked ?? []).filter((b) => toDateKey(new Date(b.start_at)) === key);
              const isToday = key === toDateKey(new Date());
              return (
                <div
                  key={key}
                  className={cn(
                    "rounded-xl border p-2",
                    isToday ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <p className="text-xs text-muted-foreground">{DAYS_SQ_SHORT[d.getDay()]}</p>
                  <p className="text-sm font-semibold">{d.getDate()}</p>
                  <div className="mt-2 space-y-1">
                    {dayAppts.map((a) => (
                      <div key={a.id} className="rounded-lg bg-muted p-2 text-xs">
                        <p className="font-medium">{formatTime(a.start_at)}</p>
                        <p className="truncate">
                          {a.client_first_name} {a.client_last_name}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {APPOINTMENT_STATUS_SQ[a.status as AppointmentStatus]}
                        </p>
                      </div>
                    ))}
                    {dayBlocks.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-start justify-between gap-1 rounded-lg border border-dashed border-border p-2 text-xs"
                      >
                        <span>
                          {formatTime(b.start_at)}–{formatTime(b.end_at)}
                          {b.reason ? <span className="block text-muted-foreground">{b.reason}</span> : null}
                        </span>
                        <button
                          aria-label="Hiq bllokimin"
                          onClick={() => removeBlock.mutate(b.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {!dayAppts.length && !dayBlocks.length ? (
                      <p className="text-xs text-muted-foreground">—</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-semibold">Blloko një kohë</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Koha e bllokuar nuk shfaqet si e lirë për klientët.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="bt-date">Data</Label>
            <Input
              id="bt-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bt-start">Nga</Label>
            <Input
              id="bt-start"
              type="time"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bt-end">Deri</Label>
            <Input
              id="bt-end"
              type="time"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bt-reason">Arsyeja (opsional)</Label>
            <Input
              id="bt-reason"
              value={form.reason}
              maxLength={120}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
        </div>
        <Button className="mt-4" onClick={() => addBlock.mutate()} disabled={addBlock.isPending}>
          {addBlock.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Blloko kohën
        </Button>
      </section>
    </div>
  );
}