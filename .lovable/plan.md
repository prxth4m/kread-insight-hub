# Extract Date Range Picker into Shared Component

Move the inline `RangePopover` in `compare.ranges.tsx` into a reusable shadcn-style component so it can be used elsewhere later.

## What changes

1. **New file**: `src/components/ui/date-range-picker.tsx`
   - Exports `DateRangePicker` component with props `{ label?, value, onChange, numberOfMonths?, align?, className? }`.
   - Uses shadcn `Popover` + `Calendar` (`mode="range"`), `lucide-react` `CalendarIcon`, `date-fns` `format`, and `react-day-picker`'s `DateRange` type.
   - Trigger is an outline `Button` showing `label` and the formatted range (e.g. `Jun 1 – Jun 15`) or "Pick a date range".
   - Calendar wrapper keeps the existing `cn("p-3 pointer-events-auto")` class so it works inside popovers/dialogs.
   - Defaults: `numberOfMonths = 2`, `align = "start"`.

2. **Update**: `src/routes/_authenticated/compare.ranges.tsx`
   - Delete the local `RangePopover` function and its `fmtRange` helper (move formatting inside the new component).
   - Replace the two `<RangePopover ... />` call sites with `<DateRangePicker ... />` imported from `@/components/ui/date-range-picker`.
   - No behavior or prop-shape changes — same `label`, `value`, `onChange`.

## Not changing

- `src/components/period-selector.tsx` (single-date, separate component).
- `src/components/ui/calendar.tsx`, `popover.tsx`, `button.tsx`.
- Compare-ranges page logic, presets, queries, or layout — only the two range-picker JSX nodes get swapped.

## Technical notes

- No new dependencies — `react-day-picker`, `date-fns`, and `lucide-react` are already installed and used in `compare.ranges.tsx`.
- Component follows the shadcn datepicker convention (`pointer-events-auto` on calendar) so it stays interactive inside dialogs/sheets.
