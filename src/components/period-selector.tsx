import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { type PeriodMode, getPeriodRange } from "@/lib/period";
import { cn } from "@/lib/utils";

export function PeriodSelector({
  mode,
  onModeChange,
  date,
  onDateChange,
}: {
  mode: PeriodMode;
  onModeChange: (m: PeriodMode) => void;
  date: Date;
  onDateChange: (d: Date) => void;
}) {
  const range = getPeriodRange(mode, date);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={mode} onValueChange={(v) => onModeChange(v as PeriodMode)}>
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("justify-start gap-2 font-normal")}>
            <CalendarIcon className="h-4 w-4" />
            {range.label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && onDateChange(d)}
            className="pointer-events-auto p-3"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}