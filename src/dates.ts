// Calendar days in UTC, the radar's one clock for dates such as publication days and deadlines.

export const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-10-15" for any moment on that UTC day.
export const dayOf = (at: Date) => at.toISOString().slice(0, 10);

export const daysBefore = (at: Date, days: number) => new Date(at.getTime() - days * DAY_MS);

export const addDays = (day: string, days: number) => dayOf(new Date(Date.parse(day) + days * DAY_MS));

// Whole days from one calendar day to another, negative when `to` comes first.
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
