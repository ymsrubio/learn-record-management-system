import { and, asc, eq, gt, lt, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { clinicInstant, type AppEnv } from '../clock';
import { canChangeStatus, endOf, isWithinWorkingHours, walkInStart } from '../appointments/rules';
import { parseCreate, parseEdit, parseStatus, parseWalkIn, startOf } from '../appointments/validate';
import { auditOnCreate, auditOnUpdate } from '../db/audit';
import { getDb } from '../db/client';
import { appointments, patients } from '../db/schema';
import { isCalendarDate } from '../patients/validate';

type Db = ReturnType<typeof getDb>;
type AppointmentRow = typeof appointments.$inferSelect;

const MINUTE_MS = 60_000;

// What the API returns for an Appointment. `date` and `time` are the clinic wall-clock parts of
// startAt, so an edit form can be filled without doing time zone maths in the browser.
function present(a: AppointmentRow, patientName: string) {
    const wall = new Date(a.startAt.getTime() + 8 * 60 * MINUTE_MS).toISOString();
    return {
        id: a.id,
        patientId: a.patientId,
        patientName,
        startAt: a.startAt.toISOString(),
        date: wall.slice(0, 10),
        time: wall.slice(11, 16),
        durationMinutes: a.durationMinutes,
        reason: a.reason,
        status: a.status,
        walkIn: a.walkIn,
        // Treatment Notes arrive in a later slice. Until then no Appointment has one, so no status is held.
        statusLocked: false,
    };
}

// Warnings never block saving. An overlap names the other non-cancelled Appointments whose time
// range intersects this one (two ranges overlap when each starts before the other ends).
async function warningsFor(db: Db, a: Pick<AppointmentRow, 'id' | 'startAt' | 'durationMinutes'>) {
    const end = endOf(a.startAt, a.durationMinutes);
    const others = await db
        .select({ a: appointments, patientName: patients.fullName })
        .from(appointments)
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        .where(
            and(
                ne(appointments.id, a.id),
                ne(appointments.status, 'cancelled'),
                lt(appointments.startAt, end),
                gt(sql`${appointments.startAt} + ${appointments.durationMinutes} * ${MINUTE_MS}`, a.startAt.getTime()),
            ),
        )
        .orderBy(asc(appointments.startAt));
    return {
        overlaps: others.map(({ a: other, patientName }) => ({
            appointmentId: other.id,
            patientName,
            startAt: other.startAt.toISOString(),
            durationMinutes: other.durationMinutes,
        })),
        outsideWorkingHours: !isWithinWorkingHours(a.startAt, a.durationMinutes),
    };
}

async function findPatient(db: Db, id: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    return patient;
}

async function findAppointment(db: Db, id: string) {
    const [row] = await db
        .select({ a: appointments, patientName: patients.fullName, archivedAt: patients.archivedAt })
        .from(appointments)
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        .where(eq(appointments.id, id));
    return row;
}

const NOT_FOUND = { error: 'Appointment not found' } as const;
const ARCHIVED = { error: 'This Patient is Archived. Restore them to change their Appointments.', code: 'patient_archived' } as const;

// Sub-app for /api/appointments. Create, edit and Walk-in answer `{ appointment, warnings }`.
export const appointmentsRoutes = new Hono<AppEnv>()
    // The Schedule's range query: Appointments whose clinic date is in [from, to], oldest first.
    .get('/', async (c) => {
        const from = c.req.query('from') ?? '';
        const to = c.req.query('to') ?? '';
        if (!isCalendarDate(from) || !isCalendarDate(to) || to < from) {
            return c.json({ error: 'from and to must be dates (YYYY-MM-DD), with to on or after from' }, 400);
        }
        const dayAfterTo = new Date(clinicInstant(to, '00:00').getTime() + 24 * 60 * MINUTE_MS);
        const rows = await getDb(c.env)
            .select({ a: appointments, patientName: patients.fullName })
            .from(appointments)
            .innerJoin(patients, eq(patients.id, appointments.patientId))
            .where(and(gt(appointments.startAt, new Date(clinicInstant(from, '00:00').getTime() - 1)), lt(appointments.startAt, dayAfterTo)))
            .orderBy(asc(appointments.startAt));
        return c.json(rows.map((r) => present(r.a, r.patientName)));
    })
    .post(
        '/',
        validator('json', (body, c) => {
            const parsed = parseCreate(body);
            return parsed.ok ? parsed.value : c.json({ errors: parsed.errors }, 400);
        }),
        async (c) => {
            const input = c.req.valid('json');
            const db = getDb(c.env);
            const patient = await findPatient(db, input.patientId);
            if (!patient) return c.json({ errors: { patientId: 'Choose a patient.' } }, 400);
            if (patient.archivedAt) return c.json(ARCHIVED, 409);

            const [row] = await db
                .insert(appointments)
                .values({ patientId: patient.id, startAt: startOf(input), durationMinutes: input.durationMinutes, reason: input.reason, ...auditOnCreate(c) })
                .returning();
            return c.json({ appointment: present(row, patient.fullName), warnings: await warningsFor(db, row) }, 201);
        },
    )
    // A Walk-in is an Appointment for right now (rounded down to 5 minutes) at the default duration.
    // Declared before '/:id' so "walk-in" is not read as an id.
    .post(
        '/walk-in',
        validator('json', (body, c) => {
            const parsed = parseWalkIn(body);
            return parsed.ok ? parsed.value : c.json({ errors: parsed.errors }, 400);
        }),
        async (c) => {
            const db = getDb(c.env);
            const patient = await findPatient(db, c.req.valid('json').patientId);
            if (!patient) return c.json({ errors: { patientId: 'Choose a patient.' } }, 400);
            if (patient.archivedAt) return c.json(ARCHIVED, 409);

            const [row] = await db
                .insert(appointments)
                .values({ patientId: patient.id, startAt: walkInStart(c.var.clock.now()), walkIn: true, ...auditOnCreate(c) })
                .returning();
            return c.json({ appointment: present(row, patient.fullName), warnings: await warningsFor(db, row) }, 201);
        },
    )
    .get('/:id', async (c) => {
        const db = getDb(c.env);
        const found = await findAppointment(db, c.req.param('id'));
        if (!found) return c.json(NOT_FOUND, 404);
        return c.json({ appointment: present(found.a, found.patientName), warnings: await warningsFor(db, found.a) });
    })
    // Edit date, time, duration and reason. The Patient cannot change.
    .patch(
        '/:id',
        validator('json', (body, c) => {
            const parsed = parseEdit(body);
            return parsed.ok ? parsed.value : c.json({ errors: parsed.errors }, 400);
        }),
        async (c) => {
            const input = c.req.valid('json');
            const db = getDb(c.env);
            const found = await findAppointment(db, c.req.param('id'));
            if (!found) return c.json(NOT_FOUND, 404);
            if (found.archivedAt) return c.json(ARCHIVED, 409);

            const [row] = await db
                .update(appointments)
                .set({ startAt: startOf(input), durationMinutes: input.durationMinutes, reason: input.reason, ...auditOnUpdate(c) })
                .where(eq(appointments.id, found.a.id))
                .returning();
            return c.json({ appointment: present(row, found.patientName), warnings: await warningsFor(db, row) });
        },
    )
    .post(
        '/:id/status',
        validator('json', (body, c) => {
            const parsed = parseStatus(body);
            return parsed.ok ? parsed.value : c.json({ errors: parsed.errors }, 400);
        }),
        async (c) => {
            const { status } = c.req.valid('json');
            const db = getDb(c.env);
            const found = await findAppointment(db, c.req.param('id'));
            if (!found) return c.json(NOT_FOUND, 404);
            if (found.archivedAt) return c.json(ARCHIVED, 409);

            // Treatment Notes (a later slice) will supply this. Until then no Appointment has one.
            const hasTreatmentNote = false;
            if (!canChangeStatus(found.a.status, status, hasTreatmentNote)) {
                return c.json({ error: 'A Completed Appointment with a Treatment Note stays Completed.', code: 'completed_has_note' }, 409);
            }

            const [row] = await db
                .update(appointments)
                .set({ status, ...auditOnUpdate(c) })
                .where(eq(appointments.id, found.a.id))
                .returning();
            return c.json({ appointment: present(row, found.patientName), warnings: await warningsFor(db, row) });
        },
    );
