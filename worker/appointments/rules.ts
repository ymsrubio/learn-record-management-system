export const DEFAULT_DURATION_MINUTES = 30;
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 480;

export const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
export type Status = (typeof STATUSES)[number];

// Working Hours are fixed in code for the MVP. Each period is [open, close) in minutes after
// clinic midnight, keyed by weekday (0 = Sunday). A day may have several periods; a missing day is closed.
const MORNING: Period = [8 * 60, 12 * 60];
const AFTERNOON: Period = [13 * 60, 17 * 60];
type Period = readonly [open: number, close: number];
export const WORKING_HOURS: Record<number, readonly Period[]> = {
    1: [MORNING, AFTERNOON],
    2: [MORNING, AFTERNOON],
    3: [MORNING, AFTERNOON],
    4: [MORNING, AFTERNOON],
    5: [MORNING, AFTERNOON],
    6: [MORNING, AFTERNOON],
};

const MINUTE_MS = 60_000;
// Asia/Manila is UTC+8 all year, so shifting an instant by 8 hours turns clinic wall-clock into UTC fields.
const CLINIC_OFFSET_MINUTES = 8 * 60;

// True when every minute of the Appointment falls inside one open period of its clinic day.
export function isWithinWorkingHours(start: Date, durationMinutes: number): boolean {
    const local = new Date(start.getTime() + CLINIC_OFFSET_MINUTES * MINUTE_MS);
    const from = local.getUTCHours() * 60 + local.getUTCMinutes();
    const to = from + durationMinutes;
    return (WORKING_HOURS[local.getUTCDay()] ?? []).some(([open, close]) => open <= from && to <= close);
}

// The current clinic time rounded down to 5 minutes, for a Walk-in.
export function walkInStart(now: Date): Date {
    const step = 5 * MINUTE_MS;
    return new Date(Math.floor(now.getTime() / step) * step);
}

export function endOf(start: Date, durationMinutes: number): Date {
    return new Date(start.getTime() + durationMinutes * MINUTE_MS);
}

// Any status can change to any other, except that a Completed Appointment with a Treatment Note stays Completed.
export function canChangeStatus(from: Status, to: Status, hasTreatmentNote: boolean): boolean {
    return !(from === 'completed' && to !== 'completed' && hasTreatmentNote);
}
