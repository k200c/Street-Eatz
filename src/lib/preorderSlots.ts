export interface PreorderDayHours {
  start: string;
  end: string;
}

export type PreorderHours = Record<string, PreorderDayHours | undefined>;

export interface PreorderSlot {
  iso: string;
  label: string;
}

interface SlotOptions {
  date: string;
  hoursByDay: PreorderHours;
  intervalMinutes: number;
  earliest: Date;
  latest: Date;
}

const FOOD_OS_TIME_ZONE = 'Europe/Dublin';

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

const parseLocalDate = (value: string): LocalDateParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
};

const zonedParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-IE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
};

export const dateInputValue = (date: Date, timeZone = FOOD_OS_TIME_ZONE): string => {
  const parts = zonedParts(date, timeZone);
  const year = parts.year;
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const zonedDateTimeToUtc = (
  dateValue: string,
  minutes: number,
  timeZone = FOOD_OS_TIME_ZONE,
): Date | null => {
  const date = parseLocalDate(dateValue);
  if (!date || !Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return null;

  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const wallClockUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0, 0);
  let candidate = new Date(wallClockUtc);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const represented = zonedParts(candidate, timeZone);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    candidate = new Date(candidate.getTime() + (wallClockUtc - representedUtc));
  }

  const verified = zonedParts(candidate, timeZone);
  if (
    verified.year !== date.year
    || verified.month !== date.month
    || verified.day !== date.day
    || verified.hour !== hour
    || verified.minute !== minute
  ) return null;

  return candidate;
};

export const parseTimeMinutes = (value: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const labelForMinutes = (minutes: number): string => {
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return new Intl.DateTimeFormat('en-IE', { hour: 'numeric', minute: '2-digit' }).format(date);
};

export const buildPreorderSlots = ({
  date,
  hoursByDay,
  intervalMinutes,
  earliest,
  latest,
}: SlotOptions): PreorderSlot[] => {
  const selectedDate = parseLocalDate(date);
  if (!selectedDate || !Number.isInteger(intervalMinutes) || intervalMinutes <= 0) return [];

  const dayOfWeek = new Date(Date.UTC(selectedDate.year, selectedDate.month - 1, selectedDate.day)).getUTCDay();
  const hours = hoursByDay[String(dayOfWeek)];
  if (!hours) return [];
  const start = parseTimeMinutes(hours.start);
  const end = parseTimeMinutes(hours.end);
  if (start === null || end === null || start >= end) return [];

  const available: PreorderSlot[] = [];
  for (let minutes = start; minutes < end; minutes += intervalMinutes) {
    const slot = zonedDateTimeToUtc(date, minutes);
    if (!slot) continue;
    if (slot >= earliest && slot <= latest) {
      available.push({ iso: slot.toISOString(), label: labelForMinutes(minutes) });
    }
  }
  return available;
};

export const findNextPreorderDate = (
  options: Omit<SlotOptions, 'date'> & { startDate: string; maxDaysToScan: number },
): { date: string; slots: PreorderSlot[] } | null => {
  const start = parseLocalDate(options.startDate);
  if (!start || !Number.isInteger(options.maxDaysToScan) || options.maxDaysToScan < 0) return null;

  for (let offset = 0; offset <= options.maxDaysToScan; offset += 1) {
    const candidate = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const date = `${candidate.getUTCFullYear()}-${String(candidate.getUTCMonth() + 1).padStart(2, '0')}-${String(candidate.getUTCDate()).padStart(2, '0')}`;
    const slots = buildPreorderSlots({ ...options, date });
    if (slots.length > 0) return { date, slots };
  }
  return null;
};
