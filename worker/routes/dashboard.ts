import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { clinicInstant, type AppEnv } from '../clock';
import { endOf } from '../appointments/rules';
import { getDb } from '../db/client';
import { appointments, patients } from '../db/schema';

const DAY_MS = 24 * 60 * 60_000;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// Clinic wall-clock parts of an instant. Asia/Manila is UTC+8 all year, so a fixed shift is exact.
const wall = (instant: Date) => new Date(instant.getTime() + 8 * 60 * 60_000).toISOString();

function present(a: typeof appointments.$inferSelect, patientName: string) {
    const w = wall(a.startAt);
    return {
        id: a.id,
        patientId: a.patientId,
        patientName,
        startAt: a.startAt.toISOString(),
        date: w.slice(0, 10),
        time: w.slice(11, 16),
        durationMinutes: a.durationMinutes,
        reason: a.reason,
        status: a.status,
    };
}

// Sub-app for /api/dashboard: everything the home screen shows, in one round trip. "Today" comes
// from the Clock, so it is the clinic's date, not the server's or the browser's.
export const dashboardRoutes = new Hono<AppEnv>().get('/', async (c) => {
    const db = getDb(c.env);
    const now = c.var.clock.now();
    const today = c.var.clock.today();
    const todayStart = clinicInstant(today, '00:00');
    const weekEnd = clinicInstant(addDays(today, 7), '00:00');

    const rows = await db
        .select({ a: appointments, patientName: patients.fullName })
        .from(appointments)
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        .where(and(gt(appointments.startAt, new Date(todayStart.getTime() - 1)), lt(appointments.startAt, weekEnd)))
        .orderBy(asc(appointments.startAt));

    const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
    const todayList = rows.filter((r) => r.a.startAt < tomorrowStart);

    // The next upcoming Appointment is the first Scheduled one that has not finished yet, so one in
    // progress still counts.
    const next = todayList.find((r) => r.a.status === 'scheduled' && endOf(r.a.startAt, r.a.durationMinutes) > now);

    const needsStatusUpdate = await db
        .select({ a: appointments, patientName: patients.fullName })
        .from(appointments)
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        // An Archived Patient's Appointment cannot be updated, so it is not asked about.
        .where(and(eq(appointments.status, 'scheduled'), lt(appointments.startAt, todayStart), isNull(patients.archivedAt)))
        .orderBy(asc(appointments.startAt));

    const pendingIntake = await db
        .select({ id: patients.id, fullName: patients.fullName, mobilePhone: patients.mobilePhone })
        .from(patients)
        .where(and(isNull(patients.intakeCompletedAt), isNull(patients.archivedAt)))
        .orderBy(asc(patients.createdAt));

    const nextDays = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(today, i);
        return { date, count: rows.filter((r) => r.a.status !== 'cancelled' && wall(r.a.startAt).slice(0, 10) === date).length };
    });

    const [anyPatient] = await db.select({ id: patients.id }).from(patients).limit(1);

    return c.json({
        today,
        todaysAppointments: todayList.map((r) => present(r.a, r.patientName)),
        nextAppointmentId: next?.a.id ?? null,
        needsStatusUpdate: needsStatusUpdate.map((r) => present(r.a, r.patientName)),
        pendingIntake,
        nextDays,
        clinicIsEmpty: !anyPatient,
    });
});
