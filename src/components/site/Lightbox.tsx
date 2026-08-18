import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type GalleryImage = { id: string; url: string; alt: string | null };

export function GalleryGrid({ images, name }: { images: GalleryImage[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? null : (i + 1) % images.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? null : (i - 1 + images.length) % images.length));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  if (!images.length) return null;

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">Galeria</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpen(i)}
            className="overflow-hidden rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <img
              src={img.url}
              alt={img.alt ?? `${name} - PhysioPlus`}
              loading="lazy"
              className="aspect-square w-full object-cover transition-transform hover:scale-105"
            />
          </button>
        ))}
      </div>

      {open !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/90 p-4">
          <Button variant="ghost" size="icon" className="absolute right-4 top-4 text-background" onClick={() => setOpen(null)}>
            <X className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 text-background"
            onClick={() => setOpen((i) => (i === null ? null : (i - 1 + images.length) % images.length))}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <figure className="max-h-full max-w-4xl text-center">
            <img
              src={images[open]!.url}
              alt={images[open]!.alt ?? `${name} - PhysioPlus`}
              className="max-h-[80vh] w-auto rounded-xl object-contain"
            />
            <figcaption className="mt-3 text-sm text-background">
              {open + 1} / {images.length}
            </figcaption>
          </figure>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 text-background"
            onClick={() => setOpen((i) => (i === null ? null : (i + 1) % images.length))}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
