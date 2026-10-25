import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import * as schema from '../worker/db/schema';
import { request, at } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';

type Session = Awaited<ReturnType<typeof signInAsDentist>>;

const json = (session: Session, body: unknown, method = 'POST', extra: Record<string, string> = {}): RequestInit => ({
    method,
    headers: { ...session.headers, 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
});

const db = () => drizzle(env.DB, { schema });

async function quickAdd(session: Session, body: unknown) {
    const res = await request('/api/patients', json(session, body));
    return { res, body: (await res.json()) as any };
}

describe('quick add', () => {
    it('creates a Pending Intake Patient from just a name and phone', async () => {
        const session = await signInAsDentist(app);
        const { res, body } = await quickAdd(session, { fullName: '  Maria Santos ', mobilePhone: '0917 123 4567' });

        expect(res.status).toBe(201);
        expect(body.patient).toMatchObject({
            fullName: 'Maria Santos',
            mobilePhone: '0917 123 4567',
            birthdate: null,
            age: null,
            flags: { pendingIntake: true, archived: false },
        });
        expect(body.appointmentId).toBeNull();
    });

    it('creates the Patient and an Appointment in one request, at the clinic wall-clock time', async () => {
        const session = await signInAsDentist(app);
        const { res, body } = await quickAdd(session, {
            fullName: 'Juan Dela Cruz',
            mobilePhone: '09171234567',
            appointment: { date: '2026-11-03', time: '14:30', reason: 'Toothache' },
        });

        expect(res.status).toBe(201);
        const [row] = await db().select().from(schema.appointments);
        expect(row).toMatchObject({
            id: body.appointmentId,
            patientId: body.patient.id,
            reason: 'Toothache',
            status: 'scheduled',
            durationMinutes: 30,
            walkIn: false,
        });
        expect(row.startAt.toISOString()).toBe('2026-11-03T06:30:00.000Z');
    });

    it('rejects a missing name and phone with a message per field, and saves nothing', async () => {
        const session = await signInAsDentist(app);
        const { res, body } = await quickAdd(session, { fullName: '   ' });

        expect(res.status).toBe(400);
        expect(body.errors).toEqual({ fullName: 'Enter the full name.', mobilePhone: 'Enter a phone number.' });
        expect(await db().select().from(schema.patients)).toEqual([]);
    });

    it('rejects an invalid phone and an incomplete Appointment, and saves neither', async () => {
        const session = await signInAsDentist(app);
        const { res, body } = await quickAdd(session, {
            fullName: 'Ana Cruz',
            mobilePhone: 'call me',
            appointment: { date: '2026-02-30', time: '25:00' },
        });

        expect(res.status).toBe(400);
        expect(Object.keys(body.errors).sort()).toEqual(['appointment.date', 'appointment.time', 'mobilePhone']);
        expect(await db().select().from(schema.patients)).toEqual([]);
        expect(await db().select().from(schema.appointments)).toEqual([]);
    });

    it('records the signed-in User as author, and keeps normalised search columns', async () => {
        const session = await signInAsDentist(app);
        const me = (await (await request('/api/me', session)).json()) as { id: string };
        await quickAdd(session, { fullName: 'José  PEÑA', mobilePhone: '+63 917-123-4567' });

        const [row] = await db().select().from(schema.patients);
        expect(row).toMatchObject({
            createdBy: me.id,
            updatedBy: me.id,
            nameSearch: 'jose pena',
            phoneSearch: '9171234567',
        });
    });
});

describe('Patient Record', () => {
    it('returns details, flags and an empty timeline for a new Patient', async () => {
        const session = await signInAsDentist(app);
        const { body: created } = await quickAdd(session, { fullName: 'Maria Santos', mobilePhone: '09171234567' });

        const res = await request(`/api/patients/${created.patient.id}`, session);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            patient: {
                id: created.patient.id,
                fullName: 'Maria Santos',
                mobilePhone: '09171234567',
                birthdate: null,
                age: null,
                flags: { pendingIntake: true, archived: false },
            },
            alerts: [],
            timeline: [],
        });
    });

    it('lists Appointments newest first', async () => {
        const session = await signInAsDentist(app);
        const { body: created } = await quickAdd(session, {
            fullName: 'Maria Santos',
            mobilePhone: '09171234567',
            appointment: { date: '2026-11-03', time: '09:00', reason: 'Cleaning' },
        });
        await db().insert(schema.appointments).values({
            patientId: created.patient.id,
            startAt: new Date('2026-12-01T01:00:00Z'),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const record = (await (await request(`/api/patients/${created.patient.id}`, session)).json()) as any;
        expect(record.timeline.map((a: any) => a.startAt)).toEqual(['2026-12-01T01:00:00.000Z', '2026-11-03T01:00:00.000Z']);
        expect(record.timeline[1]).toMatchObject({ reason: 'Cleaning', status: 'scheduled', durationMinutes: 30 });
    });

    it('works out age on the clinic date', async () => {
        const session = await signInAsDentist(app);
        const { body: created } = await quickAdd(session, { fullName: 'Maria Santos', mobilePhone: '09171234567' });
        await request(
            `/api/patients/${created.patient.id}`,
            json(session, { fullName: 'Maria Santos', mobilePhone: '09171234567', birthdate: '2000-06-15' }, 'PATCH'),
        );

        const age = async (instant: string) =>
            ((await (await request(`/api/patients/${created.patient.id}`, at(instant, session.headers))).json()) as any).patient.age;
        expect(await age('2026-06-14T00:00:00+08:00')).toBe(25);
        expect(await age('2026-06-15T00:00:00+08:00')).toBe(26);
        // 2026-06-14 20:00 UTC is already 15 June in Manila
        expect(await age('2026-06-14T20:00:00Z')).toBe(26);
    });

    it('answers 404 for an unknown Patient', async () => {
        const session = await signInAsDentist(app);
        expect((await request('/api/patients/nope', session)).status).toBe(404);
        expect((await request('/api/patients/nope', json(session, { fullName: 'A', mobilePhone: '09171234567' }, 'PATCH'))).status).toBe(404);
    });

    it('records a recently seen entry each time it is opened, keeping one row per User and Patient', async () => {
        const session = await signInAsDentist(app);
        const { body: a } = await quickAdd(session, { fullName: 'Ana Cruz', mobilePhone: '09171234567' });
        expect(await db().select().from(schema.patientViews)).toEqual([]);

        await request(`/api/patients/${a.patient.id}`, at('2026-11-02T01:00:00Z', session.headers));
        await request(`/api/patients/${a.patient.id}`, at('2026-11-02T05:00:00Z', session.headers));

        const views = await db().select().from(schema.patientViews);
        expect(views).toHaveLength(1);
        expect(views[0]).toMatchObject({ patientId: a.patient.id });
        expect(views[0].lastViewedAt.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    });
});

describe('editing details', () => {
    it('updates the Patient and rewrites the normalised search columns', async () => {
        const session = await signInAsDentist(app);
        const { body: created } = await quickAdd(session, { fullName: 'Maria Santos', mobilePhone: '09171234567' });

        const res = await request(
            `/api/patients/${created.patient.id}`,
            json(session, { fullName: 'María Peña-Santos', mobilePhone: '+63 998 765 4321', birthdate: '1990-01-31' }, 'PATCH', {
                'X-Test-Now': '2026-11-05T00:00:00Z',
            }),
        );

        expect(res.status).toBe(200);
        expect(((await res.json()) as any).patient).toMatchObject({
            fullName: 'María Peña-Santos',
            mobilePhone: '+63 998 765 4321',
            birthdate: '1990-01-31',
            age: 36,
            flags: { pendingIntake: true },
        });
        const [row] = await db().select().from(schema.patients);
        expect(row).toMatchObject({ nameSearch: 'maria pena-santos', phoneSearch: '9987654321' });
        expect(row.updatedAt.toISOString()).toBe('2026-11-05T00:00:00.000Z');
    });

    it('rejects bad details with field errors and leaves the Patient unchanged', async () => {
        const session = await signInAsDentist(app);
        const { body: created } = await quickAdd(session, { fullName: 'Maria Santos', mobilePhone: '09171234567' });

        const res = await request(
            `/api/patients/${created.patient.id}`,
            json(session, { fullName: '', mobilePhone: '', birthdate: '2999-01-01' }, 'PATCH'),
        );

        expect(res.status).toBe(400);
        expect(Object.keys(((await res.json()) as any).errors).sort()).toEqual(['birthdate', 'fullName', 'mobilePhone']);
        const [row] = await db().select().from(schema.patients);
        expect(row).toMatchObject({ fullName: 'Maria Santos', nameSearch: 'maria santos' });
    });
});
