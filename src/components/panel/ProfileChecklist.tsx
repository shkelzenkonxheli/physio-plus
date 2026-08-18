import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { translateError, PROFILE_STATUS_SQ, type ProfileStatus } from "@/lib/labels";

export type ChecklistInput = {
  physioId: string;
  status: ProfileStatus;
  hasBio: boolean;
  hasPhoto: boolean;
  hasContact: boolean;
  hasSpecializations: boolean;
  categories: number;
  services: number;
  workingDays: number;
};

export function ProfileChecklist(props: ChecklistInput) {
  const qc = useQueryClient();
  const items: { label: string; ok: boolean }[] = [
    { label: "Informacioni bazë dhe biografia", ok: props.hasBio },
    { label: "Fotoja e profilit", ok: props.hasPhoto },
    { label: "Kontakti (telefoni)", ok: props.hasContact },
    { label: "Specializimet", ok: props.hasSpecializations },
    { label: "Kategoritë", ok: props.categories > 0 },
    { label: "Shërbimet", ok: props.services > 0 },
    { label: "Orari i punës", ok: props.workingDays > 0 },
  ];
  const done = items.filter((i) => i.ok).length;
  const pct = Math.round((done / items.length) * 100);
  const ready = done === items.length;

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("physiotherapists")
        .update({ status: "PENDING_APPROVAL" })
        .eq("id", props.physioId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profili u dërgua për aprovim.");
      void qc.invalidateQueries({ queryKey: ["my-physio"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Ndërto profilin tënd</h3>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">
          {PROFILE_STATUS_SQ[props.status]}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Profili juaj është {pct}% i kompletuar.</p>
      <Progress value={pct} className="mt-3" />
      <ul className="mt-4 space-y-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-sm">
            {i.ok ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <X className="h-4 w-4 text-destructive" />
            )}
            <span className={i.ok ? "" : "text-muted-foreground"}>{i.label}</span>
          </li>
        ))}
      </ul>
      {props.status === "APPROVED" ? (
        <p className="mt-4 text-sm text-success">Profili është i aprovuar dhe publik.</p>
      ) : props.status === "PENDING_APPROVAL" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Profili është dërguar për aprovim. Do të njoftoheni pas shqyrtimit.
        </p>
      ) : (
        <Button className="mt-4" disabled={!ready || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {ready ? "Dërgo për aprovim" : "Plotëso elementet që mungojnë"}
        </Button>
      )}
    </div>
  );
}
