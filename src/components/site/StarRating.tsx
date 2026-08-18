import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  count,
  size = "sm",
}: {
  value: number;
  count?: number;
  size?: "sm" | "md";
}) {
  const stars = [1, 2, 3, 4, 5];
  const dim = size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {stars.map((s) => (
          <Star
            key={s}
            className={cn(
              dim,
              s <= Math.round(value)
                ? "fill-warning text-warning"
                : "text-muted-foreground/40",
            )}
          />
        ))}
      </div>
      <span className="text-sm font-medium">{Number(value).toFixed(1)}</span>
      {count != null ? (
        <span className="text-sm text-muted-foreground">({count})</span>
      ) : null}
    </div>
  );
}