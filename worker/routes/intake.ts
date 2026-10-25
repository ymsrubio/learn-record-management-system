import { eq, like } from 'drizzle-orm';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { AppEnv } from '../clock';
import { auditOnCreate, auditOnUpdate } from '../db/audit';
import { getDb } from '../db/client';
import { dentalHistories, guardians, medicalHistories, patients } from '../db/schema';
import { parseIntake } from '../intake/validate';
import { normalizeName, normalizePhone } from '../patients/normalize';

// POST /api/patients/:id/intake saves the whole Intake as one unit. worker/index.ts mounts this
// sub-app at /api/patients next to patientsRoutes, and /api/guardians for the sibling lookup.
export const intakeRoutes = new Hono<AppEnv>().post(
    '/:id/intake',
    // The validator needs the Clock's "today" to decide under-18 and the future-date checks.
    validator('json', (body, c) => {
        const parsed = parseIntake(body, c.var.clock.today());
        return parsed.ok ? parsed.value : c.json({ errors: parsed.errors }, 400);
    }),
    async (c) => {
        const input = c.req.valid('json');
        const db = getDb(c.env);
        const id = c.req.param('id');
        const [patient] = await db.select().from(patients).where(eq(patients.id, id));
        if (!patient) return c.json({ error: 'Patient not found' }, 404);

        const { personal, medical, dental } = input;
        const audit = auditOnCreate(c);
        const update = auditOnUpdate(c);

        // A Guardian shared with a sibling is one row: saving it here updates what every sibling sees.
        let guardianId: string | null = null;
        const writes = [];
        if (input.guardian) {
            const g = input.guardian;
            const fields = { name: g.name, relationship: g.relationship, phone: g.phone, phoneSearch: normalizePhone(g.phone) };
            if (g.id) {
                const [existing] = await db.select({ id: guardians.id }).from(guardians).where(eq(guardians.id, g.id));
                if (!existing) return c.json({ errors: { guardian: 'That Guardian was not found.' } }, 400);
                guardianId = g.id;
                writes.push(db.update(guardians).set({ ...fields, ...update }).where(eq(guardians.id, g.id)));
            } else {
                guardianId = crypto.randomUUID();
                writes.push(db.insert(guardians).values({ id: guardianId, ...fields, ...audit }));
            }
        }

        const clinicToday = c.var.clock.today();
        writes.push(
            db
                .update(patients)
                .set({
                    fullName: personal.fullName,
                    nameSearch: normalizeName(personal.fullName),
                    mobilePhone: personal.mobilePhone,
                    phoneSearch: normalizePhone(personal.mobilePhone),
                    birthdate: personal.birthdate,
                    previousSurname: personal.previousSurname,
                    previousSurnameSearch: personal.previousSurname && normalizeName(personal.previousSurname),
                    sex: personal.sex,
                    occupation: personal.occupation,
                    landline: personal.landline,
                    email: personal.email,
                    address: personal.address,
                    emergencyContactName: personal.emergencyContactName,
                    emergencyContactPhone: personal.emergencyContactPhone,
                    patientHistory: personal.patientHistory,
                    guardianId,
                    // Re-submitting an Intake corrects it; the first consent date and completion time stay.
                    consentGivenOn: patient.consentGivenOn ?? clinicToday,
                    intakeCompletedAt: patient.intakeCompletedAt ?? c.var.clock.now(),
                    ...update,
                })
                .where(eq(patients.id, id)),
            db
                .insert(medicalHistories)
                .values({ patientId: id, ...medical, ...audit })
                .onConflictDoUpdate({ target: medicalHistories.patientId, set: { ...medical, ...update } }),
            db
                .insert(dentalHistories)
                .values({ patientId: id, ...dental, ...audit })
                .onConflictDoUpdate({ target: dentalHistories.patientId, set: { ...dental, ...update } }),
        );
        // One db.batch is one D1 transaction: the whole Intake is saved, or none of it.
        await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);

        return c.json({ ok: true, consentGivenOn: patient.consentGivenOn ?? clinicToday });
    },
);

// Finds a Guardian by phone so a sibling's Intake can reuse them instead of typing them again.
export const guardiansRoutes = new Hono<AppEnv>().get('/', async (c) => {
    const digits = normalizePhone(c.req.query('phone') ?? '');
    if (digits.length < 7) return c.json({ guardians: [] });
    const db = getDb(c.env);
    const rows = await db.select().from(guardians).where(like(guardians.phoneSearch, `%${digits}`)).limit(5);
    return c.json({
        guardians: rows.map((g) => ({ id: g.id, name: g.name, relationship: g.relationship, phone: g.phone })),
    });
});
