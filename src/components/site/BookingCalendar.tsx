import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DAYS_SQ_SHORT, MONTHS_SQ, toDateKey } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (dateKey: string) => void;
  /** Days of week (0=Sunday) that the physiotherapist works. */
  workingDays: number[];
  /** YYYY-MM-DD dates that are fully closed. */
  closedDates?: string[];
  /** How many days ahead can be booked. */
  maxDaysAhead?: number;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function BookingCalendar({
  value,
  onChange,
  workingDays,
  closedDates = [],
  maxDaysAhead = 60,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const lastKey = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + maxDaysAhead);
    return toDateKey(d);
  }, [today, maxDaysAhead]);

  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date(`${value}T12:00:00`)));
  const closed = useMemo(() => new Set(closedDates), [closedDates]);
  const working = useMemo(() => new Set(workingDays), [workingDays]);

  const first = startOfMonth(cursor);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7;

  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1, 12),
    ),
  ];

  const canPrev = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}` >
    todayKey.slice(0, 7);
  const canNext = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}` <
    lastKey.slice(0, 7);

  function shift(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Muaji i kaluar"
          disabled={!canPrev}
          onClick={() => shift(-1)}
          className="rounded-lg border border-border p-2 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-semibold">
          {MONTHS_SQ[cursor.getMonth()]} {cursor.getFullYear()}
        </p>
        <button
          type="button"
          aria-label="Muaji i ardhshëm"
          disabled={!canNext}
          onClick={() => shift(1)}
          className="rounded-lg border border-border p-2 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <span key={d}>{DAYS_SQ_SHORT[d]}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const key = toDateKey(d);
          const disabled =
            key < todayKey || key > lastKey || closed.has(key) || !working.has(d.getDay());
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(key)}
              className={cn(
                "aspect-square rounded-xl border text-sm font-medium transition-colors",
                value === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : disabled
                    ? "border-transparent text-muted-foreground/40"
                    : "border-border bg-background hover:bg-muted",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Ditët e mbyllura dhe pushimet nuk mund të zgjidhen.
      </p>
    </div>
  );
}