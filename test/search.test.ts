import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import * as schema from '../worker/db/schema';
import { normalizeName, normalizePhone } from '../worker/patients/normalize';
import { at, request } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';

type Session = Awaited<ReturnType<typeof signInAsDentist>>;

const db = () => drizzle(env.DB, { schema });
const NOW = '2026-11-10T04:00:00.000Z';

type Seed = {
    name: string;
    phone?: string;
    previousSurname?: string;
    guardianPhone?: string;
    birthdate?: string;
    archived?: boolean;
    intakeDone?: boolean;
    appointments?: string[];
};

// Writes Patients straight into D1 the way Intake will (guardians and previous surnames have no
// route until the Intake slice), with the search columns filled by the same normalisers.
async function seed(p: Seed) {
    const id = crypto.randomUUID();
    const now = new Date(NOW);
    let guardianId: string | null = null;
    if (p.guardianPhone) {
        guardianId = crypto.randomUUID();
        await db().insert(schema.guardians).values({
            id: guardianId,
            name: 'Ana Reyes',
            relationship: 'Mother',
            phone: p.guardianPhone,
            phoneSearch: normalizePhone(p.guardianPhone),
            createdAt: now,
            updatedAt: now,
        });
    }
    await db().insert(schema.patients).values({
        id,
        fullName: p.name,
        mobilePhone: p.phone ?? null,
        nameSearch: normalizeName(p.name),
        phoneSearch: p.phone ? normalizePhone(p.phone) : null,
        previousSurname: p.previousSurname ?? null,
        previousSurnameSearch: p.previousSurname ? normalizeName(p.previousSurname) : null,
        guardianId,
        birthdate: p.birthdate ?? null,
        intakeCompletedAt: p.intakeDone ? now : null,
        archivedAt: p.archived ? now : null,
        createdAt: now,
        updatedAt: now,
    });
    for (const start of p.appointments ?? []) {
        await db().insert(schema.appointments).values({
            id: crypto.randomUUID(),
            patientId: id,
            startAt: new Date(start),
            createdAt: now,
            updatedAt: now,
        });
    }
    return id;
}

async function get(session: Session, path: string) {
    const res = await request(path, at(NOW, session.headers));
    expect(res.status).toBe(200);
    return ((await res.json()) as { results: any[] }).results;
}

const search = (s: Session, q: string, extra = '') => get(s, `/api/patients/search?q=${encodeURIComponent(q)}${extra}`);
const names = (rows: any[]) => rows.map((r) => r.fullName);

describe('patient search', () => {
    it('matches word prefixes in any order, ignoring case', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Maria Santos', phone: '0917 123 4567' });
        await seed({ name: 'Mario Dela Cruz' });

        expect(names(await search(s, 'sant mar'))).toEqual(['Maria Santos']);
        expect(names(await search(s, 'SANTOS maria'))).toEqual(['Maria Santos']);
        expect(names(await search(s, 'mar'))).toEqual(['Maria Santos', 'Mario Dela Cruz']);
        expect(await search(s, 'anto')).toEqual([]);
    });

    it('ignores accents in the stored name and in the typed query', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Ñora Peña' });

        expect(names(await search(s, 'pena'))).toEqual(['Ñora Peña']);
        expect(names(await search(s, 'peña nora'))).toEqual(['Ñora Peña']);
    });

    it('treats LIKE wildcards in the query as plain characters', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Maria Santos' });

        expect(await search(s, '%')).toEqual([]);
        expect(await search(s, 'm_ria')).toEqual([]);
    });

    it('finds the same Patient however the phone number is written', async () => {
        const s = await signInAsDentist(app);
        const id = await seed({ name: 'Maria Santos', phone: '0917-123-4567' });

        for (const q of ['0917 123 4567', '09171234567', '+63 917 123 4567', '9171234567']) {
            const rows = await search(s, q);
            expect(rows.map((r) => r.id), q).toEqual([id]);
            expect(rows[0].matchedOn).toBe('phone');
        }
    });

    it('matches a partial phone of 4 or more digits, and ignores fewer', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Maria Santos', phone: '0917 123 4567' });

        expect(names(await search(s, '0917'))).toEqual(['Maria Santos']);
        expect(names(await search(s, '4567'))).toEqual(['Maria Santos']);
        expect(await search(s, '456')).toEqual([]);
    });

    it("finds a child by the Guardian's phone and says so", async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Luis Reyes', phone: '0920 000 1111', guardianPhone: '+63 917 555 0100', birthdate: '2018-03-02' });

        const rows = await search(s, '0917 555 0100');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ fullName: 'Luis Reyes', matchedOn: 'guardianPhone', age: 8 });
    });

    it('finds a Patient by a previous surname and says so', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Maria Cruz', previousSurname: 'Santos' });

        const rows = await search(s, 'maria santos');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ fullName: 'Maria Cruz', matchedOn: 'previousSurname' });
        expect((await search(s, 'cruz'))[0].matchedOn).toBe('name');
    });

    it('lists every Patient who shares a phone', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Ana Lim', phone: '0917 888 9999' });
        await seed({ name: 'Ben Lim', phone: '+63 917 888 9999' });
        await seed({ name: 'Cy Tan', phone: '0917 111 2222', guardianPhone: '0917 888 9999' });

        expect(names(await search(s, '09178889999')).sort()).toEqual(['Ana Lim', 'Ben Lim', 'Cy Tan']);
    });

    it('puts an exact phone match first, then the most recent Appointment, newest first', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Old Visit', phone: '0917 000 0001', appointments: ['2025-01-05T02:00:00Z'] });
        await seed({ name: 'Recent Visit', phone: '0917 000 0002', appointments: ['2026-10-01T02:00:00Z', '2024-01-01T02:00:00Z'] });
        await seed({ name: 'Never Visited', phone: '0917 000 0003' });
        await seed({ name: 'Future Only', phone: '0917 000 0004', appointments: ['2027-01-01T02:00:00Z'] });

        const rows = await search(s, '0917 000');
        expect(names(rows)).toEqual(['Recent Visit', 'Old Visit', 'Future Only', 'Never Visited']);
        expect(rows[0].lastAppointmentAt).toBe('2026-10-01T02:00:00.000Z');
        expect(rows[2].lastAppointmentAt).toBeNull();

        expect(names(await search(s, '09170000001'))[0]).toBe('Old Visit');
    });

    it('lists a Patient whose whole phone equals the query before partial matches with newer Appointments', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Landline Clinic', phone: '8123456' });
        await seed({ name: 'Mobile Busy', phone: '0918 812 3456', appointments: ['2026-11-09T02:00:00Z'] });

        expect(names(await search(s, '8123456'))).toEqual(['Landline Clinic', 'Mobile Busy']);
    });

    it('caps results at 25', async () => {
        const s = await signInAsDentist(app);
        for (let i = 0; i < 30; i++) await seed({ name: `Pat Test${String(i).padStart(2, '0')}` });

        expect(await search(s, 'pat')).toHaveLength(25);
    });

    it('leaves Archived Patients out unless includeArchived is set', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Maria Santos' });
        await seed({ name: 'Marta Santos', archived: true });

        expect(names(await search(s, 'santos'))).toEqual(['Maria Santos']);
        const all = await search(s, 'santos', '&includeArchived=true');
        expect(names(all).sort()).toEqual(['Maria Santos', 'Marta Santos']);
        expect(all.find((r) => r.fullName === 'Marta Santos').flags.archived).toBe(true);
    });

    it('shows age, birthdate, phone and the Pending Intake flag on each result', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Maria Santos', phone: '0917 123 4567', birthdate: '1990-11-11' });
        await seed({ name: 'Mario Santos', intakeDone: true });

        const rows = await search(s, 'santos');
        const maria = rows.find((r) => r.fullName === 'Maria Santos');
        expect(maria).toMatchObject({ mobilePhone: '0917 123 4567', birthdate: '1990-11-11', age: 35, flags: { pendingIntake: true } });
        expect(rows.find((r) => r.fullName === 'Mario Santos').flags.pendingIntake).toBe(false);
    });

    it('returns nothing for an empty query and requires sign in', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Maria Santos' });

        expect(await search(s, '   ')).toEqual([]);
        expect((await request('/api/patients/search?q=maria')).status).toBe(401);
    });
});

describe('migration 0003 repair', () => {
    it('strips accents that the 0002 backfill left in name_search, in both cases', async () => {
        const s = await signInAsDentist(app);
        const id = await seed({ name: 'Ñora PEÑA' });
        // What 0002's lower(trim(full_name)) wrote: lowercase ASCII only, accents and capital Ñ kept.
        await env.DB.prepare('UPDATE patients SET name_search = ? WHERE id = ?').bind('Ñora peña', id).run();
        expect(await search(s, 'pena')).toEqual([]);

        const repair = env.TEST_MIGRATIONS.find((m) => m.name.startsWith('0004'))!.queries.find((q) => q.includes('UPDATE'))!;
        await env.DB.exec(repair.replace(/^--.*$/gm, '').replace(/\s+/g, ' '));

        expect(names(await search(s, 'pena nora'))).toEqual(['Ñora PEÑA']);
    });
});

describe('recently seen', () => {
    it('lists the Patients this User opened, most recent first, without Archived ones', async () => {
        const s = await signInAsDentist(app);
        const a = await seed({ name: 'Ana Lim' });
        const b = await seed({ name: 'Ben Lim' });
        const c = await seed({ name: 'Cy Tan', archived: true });
        await seed({ name: 'Never Opened' });

        for (const [id, when] of [[a, '2026-11-10T01:00:00Z'], [b, '2026-11-10T02:00:00Z'], [c, '2026-11-10T03:00:00Z'], [a, '2026-11-10T04:00:00Z']] as const) {
            expect((await request(`/api/patients/${id}`, at(when, s.headers))).status).toBe(200);
        }

        expect(names(await get(s, '/api/patients/recent'))).toEqual(['Ana Lim', 'Ben Lim']);
    });

    it('is empty before any Patient Record is opened', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Ana Lim' });
        expect(await get(s, '/api/patients/recent')).toEqual([]);
    });
});

describe('duplicate check', () => {
    it('returns up to 5 matches by the same rules, including by phone alone', async () => {
        const s = await signInAsDentist(app);
        for (let i = 0; i < 7; i++) await seed({ name: `Maria Santos${i}`, phone: `0917 000 000${i}` });
        await seed({ name: 'Someone Else', phone: '0918 777 6666' });

        expect(await get(s, '/api/patients/duplicates?name=maria')).toHaveLength(5);
        expect(names(await get(s, '/api/patients/duplicates?phone=%2B63%20918%20777%206666'))).toEqual(['Someone Else']);
        expect(names(await get(s, '/api/patients/duplicates?name=nobody&phone=0918%20777%206666'))).toEqual(['Someone Else']);
        expect(await get(s, '/api/patients/duplicates?name=zzz')).toEqual([]);
        expect(await get(s, '/api/patients/duplicates')).toEqual([]);
    });

    it('includes an Archived Patient so a returning one is not entered twice', async () => {
        const s = await signInAsDentist(app);
        await seed({ name: 'Maria Santos', archived: true });

        const rows = await get(s, '/api/patients/duplicates?name=maria%20santos');
        expect(rows).toHaveLength(1);
        expect(rows[0].flags.archived).toBe(true);
    });
});
