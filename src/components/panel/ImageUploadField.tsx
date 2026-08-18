import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadProfileImage } from "@/lib/upload";
import { cn } from "@/lib/utils";

export function ImageUploadField({
  label,
  value,
  folder,
  onChange,
  aspect = "aspect-[3/1]",
}: {
  label: string;
  value: string | null;
  folder: string;
  onChange: (url: string | null) => void;
  aspect?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadProfileImage(file, folder);
      onChange(res.url);
      toast.success("Fotografia u ngarkua.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ngarkimi dështoi.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className={cn("relative overflow-hidden rounded-xl border border-dashed border-border bg-muted/30", aspect)}>
        {value ? (
          <img src={value} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Nuk ka fotografi
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Po ngarkohet...
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild type="button" size="sm" variant="outline" disabled={busy}>
          <label className="cursor-pointer">
            <ImagePlus className="mr-2 h-4 w-4" /> {value ? "Ndrysho" : "Ngarko"}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              disabled={busy}
              className="sr-only"
              onChange={(e) => void handle(e.target.files?.[0])}
            />
          </label>
        </Button>
        {value ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
            <X className="mr-2 h-4 w-4" /> Hiq
          </Button>
        ) : null}
      </div>
    </div>
  );
}
