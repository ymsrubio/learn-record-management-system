import { Hono } from 'hono';
import type { AppEnv } from '../clock';
import { WORKING_HOURS } from '../appointments/rules';

// Sub-app for /api/schedule. The Schedule screen shades open hours from this, so the clinic's
// Working Hours live in one place (worker/appointments/rules.ts) and the screen never copies them.
export const scheduleRoutes = new Hono<AppEnv>().get('/working-hours', (c) => {
    // Always seven entries, Sunday (0) first. An empty list means the clinic is closed that day.
    const days = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        periods: (WORKING_HOURS[weekday] ?? []).map(([open, close]) => ({ open, close })),
    }));
    return c.json({ days });
});
