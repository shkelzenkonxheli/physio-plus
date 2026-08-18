import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/labels";
import { DAYS_SQ, formatDate } from "@/lib/format";

type DayRow = {
  active: boolean;
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
};

const DEFAULT_ROW: DayRow = { active: false, start: "08:00", end: "16:00", breakStart: "", breakEnd: "" };
const hhmm = (v: string | null) => (v ? v.slice(0, 5) : "");

export function useWorkingHours(physioId: string | null) {
  return useQuery({
    queryKey: ["panel-hours", physioId],
    enabled: Boolean(physioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("working_hours")
        .select("id, day_of_week, start_time, end_time, break_start, break_end, active")
        .eq("physiotherapist_id", physioId as string);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function HoursTab({ physioId }: { physioId: string }) {
  const qc = useQueryClient();
  const { data: hours, isLoading } = useWorkingHours(physioId);
  const [rows, setRows] = useState<DayRow[]>(() => Array.from({ length: 7 }, () => ({ ...DEFAULT_ROW })));

  useEffect(() => {
    if (!hours) return;
    const next = Array.from({ length: 7 }, () => ({ ...DEFAULT_ROW }));
    for (const h of hours) {
      next[h.day_of_week] = {
        active: h.active,
        start: hhmm(h.start_time) || "08:00",
        end: hhmm(h.end_time) || "16:00",
        breakStart: hhmm(h.break_start),
        breakEnd: hhmm(h.break_end),
      };
    }
    setRows(next);
  }, [hours]);

  const save = useMutation({
    mutationFn: async () => {
      for (const [i, r] of rows.entries()) {
        if (!r.active) continue;
        if (r.start >= r.end) throw new Error(`${DAYS_SQ[i]}: ora e mbylljes duhet të jetë pas orës së hapjes.`);
        if ((r.breakStart && !r.breakEnd) || (!r.breakStart && r.breakEnd))
          throw new Error(`${DAYS_SQ[i]}: plotëso të dyja orët e pushimit.`);
        if (r.breakStart && r.breakEnd && r.breakStart >= r.breakEnd)
          throw new Error(`${DAYS_SQ[i]}: pushimi nuk është i vlefshëm.`);
      }
      const { error: delErr } = await supabase.from("working_hours").delete().eq("physiotherapist_id", physioId);
      if (delErr) throw delErr;
      const payload = rows.map((r, i) => ({
        physiotherapist_id: physioId,
        day_of_week: i,
        start_time: r.start,
        end_time: r.end,
        break_start: r.breakStart || null,
        break_end: r.breakEnd || null,
        active: r.active,
      }));
      const { error } = await supabase.from("working_hours").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orari u ruajt.");
      void qc.invalidateQueries({ queryKey: ["panel-hours", physioId] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  function update(i: number, patch: Partial<DayRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-semibold">Orari i punës</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Cakto orarin për çdo ditë. Mund të shtosh edhe një pushim gjatë ditës.
        </p>
        <div className="mt-4 space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[150px_1fr]">
              <div className="flex items-center gap-3">
                <Switch checked={r.active} onCheckedChange={(v) => update(i, { active: v })} />
                <span className="font-medium">{DAYS_SQ[i]}</span>
              </div>
              {r.active ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Hapja</Label>
                    <Input type="time" value={r.start} onChange={(e) => update(i, { start: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mbyllja</Label>
                    <Input type="time" value={r.end} onChange={(e) => update(i, { end: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pushim nga</Label>
                    <Input type="time" value={r.breakStart} onChange={(e) => update(i, { breakStart: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pushim deri</Label>
                    <Input type="time" value={r.breakEnd} onChange={(e) => update(i, { breakEnd: e.target.value })} />
                  </div>
                </div>
              ) : (
                <p className="self-center text-sm text-muted-foreground">Mbyllur</p>
              )}
            </div>
          ))}
        </div>
        <Button className="mt-4" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {save.isPending ? "Po ruhet..." : "Ruaj orarin"}
        </Button>
      </div>

      <DaysOff physioId={physioId} />
    </div>
  );
}

function DaysOff({ physioId }: { physioId: string }) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");

  const { data: exceptions } = useQuery({
    queryKey: ["panel-daysoff", physioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_exceptions")
        .select("id, date, closed")
        .eq("physiotherapist_id", physioId)
        .eq("closed", true)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["panel-daysoff", physioId] });

  const add = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("Zgjidh një datë.");
      const { error } = await supabase
        .from("availability_exceptions")
        .insert({ physiotherapist_id: physioId, date, closed: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dita e lirë u shtua.");
      setDate("");
      invalidate();
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability_exceptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dita e lirë u hoq.");
      invalidate();
    },
    onError: (e) => toast.error(translateError(e)),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h3 className="font-semibold">Ditët e lira</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Festat, pushimet ose ditët personale nuk shfaqin asnjë termin të lirë.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dayoff">Data</Label>
          <Input id="dayoff" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button disabled={add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Shto ditë të lirë
        </Button>
      </div>
      {exceptions && exceptions.length ? (
        <div className="mt-4 space-y-2">
          {exceptions.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-2">
              <span className="text-sm">{formatDate(`${e.date}T00:00:00Z`)}</span>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(e.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Nuk ke ditë të lira të caktuara.</p>
      )}
    </div>
  );
}
