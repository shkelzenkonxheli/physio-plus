import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { uploadProfileImage } from "@/lib/upload";
import { translateError } from "@/lib/labels";

const MAX_IMAGES = 20;

export function useGallery(ownerType: "CLINIC" | "PHYSIOTHERAPIST", ownerId: string) {
  return useQuery({
    queryKey: ["gallery", ownerType, ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_gallery_images")
        .select("id, url, alt, sort_order")
        .eq("owner_type", ownerType)
        .eq("owner_id", ownerId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function GalleryManager({
  ownerType,
  ownerId,
  ownerName,
}: {
  ownerType: "CLINIC" | "PHYSIOTHERAPIST";
  ownerId: string;
  ownerName: string;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: images } = useGallery(ownerType, ownerId);
  const count = images?.length ?? 0;

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["gallery", ownerType, ownerId] });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profile_gallery_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fotografia u fshi.");
      invalidate();
    },
    onError: (e) => toast.error(translateError(e)),
  });

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    if (count + files.length > MAX_IMAGES) {
      toast.error(`Ke arritur maksimumin prej ${MAX_IMAGES} fotografive.`);
      return;
    }
    setBusy(true);
    try {
      let i = count;
      for (const file of Array.from(files)) {
        const res = await uploadProfileImage(file, `gallery/${ownerType.toLowerCase()}/${ownerId}`);
        const { error } = await supabase.from("profile_gallery_images").insert({
          owner_type: ownerType,
          owner_id: ownerId,
          url: res.url,
          alt: `${ownerName} - PhysioPlus`,
          sort_order: i++,
        });
        if (error) throw error;
      }
      toast.success("Fotografitë u shtuan.");
      invalidate();
    } catch (e) {
      const msg = e instanceof Error && e.message.includes("GALLERY_LIMIT_REACHED")
        ? `Ke arritur maksimumin prej ${MAX_IMAGES} fotografive.`
        : e instanceof Error ? e.message : "Ngarkimi dështoi.";
      toast.error(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Galeria</h3>
        <span className="text-sm text-muted-foreground">{count} / {MAX_IMAGES}</span>
      </div>
      <Button asChild className="mt-4" size="sm" variant="outline" disabled={busy || count >= MAX_IMAGES}>
        <label className="cursor-pointer">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
          {busy ? "Po ngarkohet..." : "+ Shto foto"}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*"
            disabled={busy || count >= MAX_IMAGES}
            className="sr-only"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      </Button>
      {images && images.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-xl border border-border">
              <img src={img.url} alt={img.alt ?? ownerName} className="aspect-square w-full object-cover" loading="lazy" />
              <Button
                size="icon"
                variant="destructive"
                className="absolute right-2 top-2 h-8 w-8"
                onClick={() => remove.mutate(img.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Ende nuk ka fotografi në galeri.</p>
      )}
    </div>
  );
}
