import { createMiddleware } from 'hono/factory';

export const CLINIC_TIMEZONE = 'Asia/Manila';

// The test-only time hook: a request carrying this header fixes "now" to the ISO
// timestamp in its value. Only honoured when env.ENVIRONMENT is 'test'.
export const TEST_NOW_HEADER = 'X-Test-Now';

export type Clock = {
    now(): Date;
    // Today's date at the clinic, 'YYYY-MM-DD'.
    today(): string;
};

// 'en-CA' formats dates as YYYY-MM-DD, which is the shape we store.
const clinicDateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export function clinicDate(instant: Date): string {
    return clinicDateFormat.format(instant);
}

// The clinic's wall-clock date and time as a UTC instant. Asia/Manila is UTC+8 all year (no daylight
// saving), so a fixed offset is exact.
export function clinicInstant(date: string, time: string): Date {
    return new Date(`${date}T${time}:00+08:00`);
}

// Whole years between a 'YYYY-MM-DD' birthdate and today's clinic date.
export function ageOn(birthdate: string, today: string): number {
    const [by, bm, bd] = birthdate.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export function createClock(now: () => Date = () => new Date()): Clock {
    return { now, today: () => clinicDate(now()) };
}

// `user` is set by requireSession (worker/auth/session.ts) on every route except the public ones.
export type SessionUser = { id: string; name: string; email: string; role: string };

export type AppEnv = { Bindings: Env; Variables: { clock: Clock; user: SessionUser } };

// Every module asks c.var.clock instead of reading the system time.
export const clockMiddleware = createMiddleware<AppEnv>(async (c, next) => {
    const fixed = c.req.header(TEST_NOW_HEADER);
    if (fixed === undefined) {
        c.set('clock', createClock());
    } else if (c.env.ENVIRONMENT !== 'test') {
        return c.json({ error: `${TEST_NOW_HEADER} is only accepted in the test environment` }, 403);
    } else {
        const instant = new Date(fixed);
        if (Number.isNaN(instant.getTime())) {
            return c.json({ error: `${TEST_NOW_HEADER} must be an ISO timestamp` }, 400);
        }
        c.set('clock', createClock(() => instant));
    }
    await next();
});
