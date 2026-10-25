import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { AppEnv } from '../clock';
import { getDb } from '../db/client';
import { amendments, appointments, medicalHistories, patients, treatmentNotes } from '../db/schema';
import { medicalAlerts } from '../intake/alerts';
import { loadNotes } from '../notes/load';
import { isLocked } from '../notes/rules';
import { parseAmendment, parseNote } from '../notes/validate';

type Db = ReturnType<typeof getDb>;

async function findAppointment(db: Db, id: string) {
    const [row] = await db
        .select({ a: appointments, patient: patients })
        .from(appointments)
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        .where(eq(appointments.id, id));
    return row;
}

const NOT_FOUND = { error: 'Appointment not found' } as const;
const NO_NOTE = { error: 'This Appointment has no Treatment Note yet.', code: 'note_not_found' } as const;
const ARCHIVED = { error: 'This Patient is Archived. Restore them to change their notes.', code: 'patient_archived' } as const;

// Mounted at /api/appointments, so '/:id/note' here is /api/appointments/:id/note.
// A Treatment Note belongs to one Completed Appointment. Once the clinic day it was written on is over
// it is Locked: edits are refused (409 note_locked) and Amendments are the only way to correct it.
export const treatmentNotesRoutes = new Hono<AppEnv>()
    // The note screen's data: the Appointment, the Patient's Medical History alerts and the note (or null).
    .get('/:id/note', async (c) => {
        const db = getDb(c.env);
        const found = await findAppointment(db, c.req.param('id'));
        if (!found) return c.json(NOT_FOUND, 404);
        const [history] = await db.select().from(medicalHistories).where(eq(medicalHistories.patientId, found.patient.id));
        const note = (await loadNotes(db, [found.a.id], c.var.clock.today())).get(found.a.id) ?? null;
        return c.json({
            appointment: {
                id: found.a.id,
                patientId: found.patient.id,
                patientName: found.patient.fullName,
                startAt: found.a.startAt.toISOString(),
                reason: found.a.reason,
                status: found.a.status,
            },
            alerts: history ? medicalAlerts(history) : [],
            note,
        });
    })
    .post(
        '/:id/note',
        validator('json', (body, c) => {
            const parsed = parseNote(body);
            return parsed.ok ? parsed.value : c.json({ errors: parsed.errors }, 400);
        }),
        async (c) => {
            const input = c.req.valid('json');
            const db = getDb(c.env);
            const found = await findAppointment(db, c.req.param('id'));
            if (!found) return c.json(NOT_FOUND, 404);
            if (found.patient.archivedAt) return c.json(ARCHIVED, 409);
            if (found.a.status !== 'completed') {
                return c.json({ error: 'A Treatment Note can only be written on a Completed Appointment.', code: 'appointment_not_completed' }, 409);
            }

            const now = c.var.clock.now();
            const by = c.var.user.id;
            const inserted = await db
                .insert(treatmentNotes)
                .values({ appointmentId: found.a.id, ...input, writtenBy: by, writtenAt: now, updatedAt: now, updatedBy: by })
                .onConflictDoNothing()
                .returning({ id: treatmentNotes.id });
            // The unique index on appointment_id decides a race between two saves, not a prior read.
            if (inserted.length === 0) {
                return c.json({ error: 'This Appointment already has a Treatment Note.', code: 'note_exists' }, 409);
            }
            const note = (await loadNotes(db, [found.a.id], c.var.clock.today())).get(found.a.id);
            return c.json({ note }, 201);
        },
    )
    .patch(
        '/:id/note',
        validator('json', (body, c) => {
            const parsed = parseNote(body);
            return parsed.ok ? parsed.value : c.json({ errors: parsed.errors }, 400);
        }),
        async (c) => {
            const input = c.req.valid('json');
            const db = getDb(c.env);
            const found = await findAppointment(db, c.req.param('id'));
            if (!found) return c.json(NOT_FOUND, 404);
            const [existing] = await db.select().from(treatmentNotes).where(eq(treatmentNotes.appointmentId, found.a.id));
            if (!existing) return c.json(NO_NOTE, 404);
            if (found.patient.archivedAt) return c.json(ARCHIVED, 409);
            if (isLocked(existing.writtenAt, c.var.clock.today())) {
                return c.json({ error: 'This Treatment Note is Locked. Add an Amendment instead.', code: 'note_locked' }, 409);
            }

            await db
                .update(treatmentNotes)
                .set({ ...input, updatedAt: c.var.clock.now(), updatedBy: c.var.user.id })
                .where(eq(treatmentNotes.id, existing.id));
            const note = (await loadNotes(db, [found.a.id], c.var.clock.today())).get(found.a.id);
            return c.json({ note });
        },
    )
    .post(
        '/:id/note/amendments',
        validator('json', (body, c) => {
            const parsed = parseAmendment(body);
            return parsed.ok ? parsed.value : c.json({ errors: parsed.errors }, 400);
        }),
        async (c) => {
            const { text } = c.req.valid('json');
            const db = getDb(c.env);
            const found = await findAppointment(db, c.req.param('id'));
            if (!found) return c.json(NOT_FOUND, 404);
            const [existing] = await db.select().from(treatmentNotes).where(eq(treatmentNotes.appointmentId, found.a.id));
            if (!existing) return c.json(NO_NOTE, 404);
            if (found.patient.archivedAt) return c.json(ARCHIVED, 409);
            if (!isLocked(existing.writtenAt, c.var.clock.today())) {
                return c.json({ error: 'This Treatment Note can still be edited. Amendments are for Locked notes.', code: 'note_not_locked' }, 409);
            }

            await db.insert(amendments).values({ treatmentNoteId: existing.id, text, writtenBy: c.var.user.id, writtenAt: c.var.clock.now() });
            const note = (await loadNotes(db, [found.a.id], c.var.clock.today())).get(found.a.id);
            return c.json({ note }, 201);
        },
    );
