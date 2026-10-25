import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { ageOn, type AppEnv } from '../clock';
import { auditOnCreate, auditOnUpdate } from '../db/audit';
import { getDb } from '../db/client';
import { appointments, patients, patientViews } from '../db/schema';
import { normalizeName, normalizePhone } from '../patients/normalize';
import { appointmentStart, parseDetails, parseQuickAdd } from '../patients/validate';

// A sub-app for everything under /api/patients. worker/index.ts mounts it with
// app.route('/api/patients', patientsRoutes), so '/' here means /api/patients.
// Handlers are chained onto the constructor (`.get(...)`, not `patientsRoutes.get(...)`) so the
// exported type carries each route's shape for the front-end's RPC client.
export const patientsRoutes = new Hono<AppEnv>()
    .get('/', async (c) => {
        const db = getDb(c.env);
        const rows = await db.select().from(patients);
        return c.json(rows);
    })
    // Quick add: a phone call gives a name and a number. The Patient is Pending Intake because
    // intake_completed_at stays null. An Appointment may ride along in the same request.
    .post('/', async (c) => {
        const parsed = parseQuickAdd(await c.req.json().catch(() => null));
        if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
        const { fullName, mobilePhone, appointment } = parsed.value;

        const db = getDb(c.env);
        const patientId = crypto.randomUUID();
        const patientRow = {
            id: patientId,
            fullName,
            mobilePhone,
            nameSearch: normalizeName(fullName),
            phoneSearch: normalizePhone(mobilePhone),
            ...auditOnCreate(c),
        };
        // db.batch sends both inserts to D1 as one transaction: both rows exist or neither does.
        const appointmentRow = appointment && {
            id: crypto.randomUUID(),
            patientId,
            startAt: appointmentStart(appointment),
            reason: appointment.reason,
            ...auditOnCreate(c),
        };
        if (appointmentRow) {
            await db.batch([db.insert(patients).values(patientRow), db.insert(appointments).values(appointmentRow)]);
        } else {
            await db.insert(patients).values(patientRow);
        }

        const [patient] = await db.select().from(patients).where(eq(patients.id, patientId));
        return c.json({ patient: present(patient, c.var.clock.today()), appointmentId: appointmentRow?.id ?? null }, 201);
    })
    // The Patient Record. Opening it also writes the recently seen entry (an upsert on user + patient).
    .get('/:id', async (c) => {
        const db = getDb(c.env);
        const [patient] = await db.select().from(patients).where(eq(patients.id, c.req.param('id')));
        if (!patient) return c.json({ error: 'Patient not found' }, 404);

        const viewedAt = c.var.clock.now();
        await db
            .insert(patientViews)
            .values({ userId: c.var.user.id, patientId: patient.id, lastViewedAt: viewedAt })
            .onConflictDoUpdate({ target: [patientViews.userId, patientViews.patientId], set: { lastViewedAt: viewedAt } });

        const rows = await db
            .select()
            .from(appointments)
            .where(eq(appointments.patientId, patient.id))
            .orderBy(desc(appointments.startAt));

        return c.json({
            patient: present(patient, c.var.clock.today()),
            // Medical History alerts arrive with Intake; the strip is part of the response shape already.
            alerts: [] as string[],
            timeline: rows.map((a) => ({
                id: a.id,
                startAt: a.startAt.toISOString(),
                durationMinutes: a.durationMinutes,
                reason: a.reason,
                status: a.status,
            })),
        });
    })
    .patch('/:id', async (c) => {
        const parsed = parseDetails(await c.req.json().catch(() => null), c.var.clock.today());
        if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
        const { fullName, mobilePhone, birthdate } = parsed.value;

        const db = getDb(c.env);
        const [updated] = await db
            .update(patients)
            .set({
                fullName,
                mobilePhone,
                birthdate,
                nameSearch: normalizeName(fullName),
                phoneSearch: normalizePhone(mobilePhone),
                ...auditOnUpdate(c),
            })
            .where(eq(patients.id, c.req.param('id')))
            .returning();
        if (!updated) return c.json({ error: 'Patient not found' }, 404);
        return c.json({ patient: present(updated, c.var.clock.today()) });
    });

type PatientRow = typeof patients.$inferSelect;

// What the API returns for a Patient: the display columns plus derived values and flags.
// The search columns stay server-side.
function present(p: PatientRow, today: string) {
    return {
        id: p.id,
        fullName: p.fullName,
        mobilePhone: p.mobilePhone,
        birthdate: p.birthdate,
        age: p.birthdate ? ageOn(p.birthdate, today) : null,
        flags: { pendingIntake: p.intakeCompletedAt === null, archived: p.archivedAt !== null },
    };
}
