import { useEffect, useRef, useState } from "react";

export type StripImage = { id: string; url: string; alt: string | null };

/** Një rresht fotografish që rrëshqet automatikisht (pauzë kur e prek me maus). */
export function PhotoStrip({
  images,
  fallbackAlt,
  onSelect,
}: {
  images: StripImage[];
  fallbackAlt: string;
  onSelect?: (url: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || images.length < 2) return;
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const half = track.scrollWidth / 2;
      if (half > 0) {
        offsetRef.current = (offsetRef.current + (dt / 1000) * 45) % half;
        track.style.transform = `translate3d(${-offsetRef.current}px,0,0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused, images.length]);

  if (!images.length) return null;
  const loop = images.length > 1 ? [...images, ...images] : images;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      className="overflow-hidden pb-2"
    >
      <div ref={trackRef} className="flex w-max gap-3 will-change-transform">
        {loop.map((img, i) => (
          <button
            key={`${img.id}-${i}`}
            type="button"
            onClick={() => onSelect?.(img.url)}
            className="group relative h-44 w-64 shrink-0 overflow-hidden rounded-2xl border border-border shadow-card sm:h-56 sm:w-80"
          >
            <img
              src={img.url}
              alt={img.alt ?? fallbackAlt}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
