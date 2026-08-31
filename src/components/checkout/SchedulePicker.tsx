import { useMemo, useState } from 'react';
import { CalendarClock, Clock3 } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { buildPreorderSlots, dateInputValue, findNextPreorderDate, PreorderHours } from '@/lib/preorderSlots';

interface SchedulePickerProps {
  mode: 'asap' | 'scheduled';
  value: string | null;
  onModeChange: (mode: 'asap' | 'scheduled') => void;
  onChange: (isoValue: string | null) => void;
}

export function SchedulePicker({ mode, value, onModeChange, onChange }: SchedulePickerProps) {
  const { data: settings } = useAppSettings();
  const [date, setDate] = useState(() => dateInputValue(new Date()));
  const preordersEnabled = settings?.preorders_enabled ?? false;

  const limits = useMemo(() => {
    const minNotice = settings?.preorder_min_notice_minutes ?? 60;
    const maxDays = settings?.preorder_max_days ?? 14;
    const earliest = new Date(Date.now() + minNotice * 60_000);
    const latest = new Date();
    latest.setDate(latest.getDate() + maxDays);
    return { earliest, latest };
  }, [settings?.preorder_max_days, settings?.preorder_min_notice_minutes]);

  const slots = useMemo(() => {
    if (!date || !settings?.preorder_hours) return [];
    return buildPreorderSlots({
      date,
      hoursByDay: settings.preorder_hours as unknown as PreorderHours,
      intervalMinutes: settings.preorder_slot_interval_minutes ?? 15,
      earliest: limits.earliest,
      latest: limits.latest,
    });
  }, [date, limits.earliest, limits.latest, settings]);

  const nextAvailable = useMemo(() => {
    if (!settings?.preorder_hours) return null;
    return findNextPreorderDate({
      startDate: dateInputValue(limits.earliest),
      maxDaysToScan: settings.preorder_max_days ?? 14,
      hoursByDay: settings.preorder_hours as unknown as PreorderHours,
      intervalMinutes: settings.preorder_slot_interval_minutes ?? 15,
      earliest: limits.earliest,
      latest: limits.latest,
    });
  }, [limits.earliest, limits.latest, settings]);

  if (!preordersEnabled) return null;

  const scheduled = mode === 'scheduled';

  return (
    <section className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <Label className="font-semibold">Collection time</Label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            onModeChange('asap');
            onChange(null);
          }}
          className={cn('rounded-lg border p-3 text-left text-sm transition-colors', !scheduled ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}
        >
          <span className="block font-semibold">As soon as possible</span>
          <span className="mt-1 block text-xs text-muted-foreground">Current wait time applies</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onModeChange('scheduled');
            if (slots[0]) {
              onChange(slots[0].iso);
            } else if (nextAvailable) {
              setDate(nextAvailable.date);
              onChange(nextAvailable.slots[0].iso);
            }
          }}
          className={cn('rounded-lg border p-3 text-left text-sm transition-colors', scheduled ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}
        >
          <span className="block font-semibold">Schedule collection</span>
          <span className="mt-1 block text-xs text-muted-foreground">Choose an available slot</span>
        </button>
      </div>

      {scheduled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="collection-date">Date</Label>
            <Input
              id="collection-date"
              type="date"
              min={dateInputValue(limits.earliest)}
              max={dateInputValue(limits.latest)}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                onChange(null);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collection-time">Time</Label>
            <Select value={value ?? undefined} onValueChange={onChange}>
              <SelectTrigger id="collection-time"><SelectValue placeholder="Choose a time" /></SelectTrigger>
              <SelectContent>
                {slots.map((slot) => <SelectItem key={slot.iso} value={slot.iso}>{slot.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {scheduled && slots.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />No collection slots are available on this date.
        </p>
      )}
    </section>
  );
}
