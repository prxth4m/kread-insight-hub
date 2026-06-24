import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

function formatRange(r: DateRange | undefined): string {
  if (!r?.from) return "Pick a date range";
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
  const from = r.from.toLocaleDateString("en-IN", opts);
  if (!r.to) return from;
  const to = r.to.toLocaleDateString("en-IN", opts);
  return `${from} → ${to}`;
}

export interface DateRangePickerProps {
  label?: string;
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  numberOfMonths?: number;
  align?: "start" | "center" | "end";
  className?: string;
}

export function DateRangePicker({
  label,
  value,
  onChange,
  numberOfMonths = 2,
  align = "start",
  className,
}: DateRangePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !value?.from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className="truncate">
            {label && <span className="mr-2 font-medium">{label}:</span>}
            {formatRange(value)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={numberOfMonths}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}