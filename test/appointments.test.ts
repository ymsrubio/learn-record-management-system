import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import { request, at } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';

type Session = Awaited<ReturnType<typeof signInAsDentist>>;

const json = (session: Session, body: unknown, method = 'POST', extra: Record<string, string> = {}): RequestInit => ({
    method,
    headers: { ...session.headers, 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
});

async function call(session: Session, path: string, init?: { body?: unknown; method?: string; headers?: Record<string, string> }) {
    const res = await request(path, init?.method || init?.body ? json(session, init.body, init.method, init.headers) : session);
    return { res, body: (await res.json()) as any };
}

async function addPatient(session: Session, fullName = 'Juan Dela Cruz') {
    const { body } = await call(session, '/api/patients', { body: { fullName, mobilePhone: '09171234567' } });
    return body.patient.id as string;
}

// 2026-11-03 is a Tuesday and 2026-11-01 a Sunday.
const book = (session: Session, patientId: string, over: Record<string, unknown> = {}) =>
    call(session, '/api/appointments', { body: { patientId, date: '2026-11-03', time: '09:00', ...over } });

describe('creating an Appointment', () => {
    it('saves it at the clinic time with the default duration and no warnings', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const { res, body } = await book(session, patientId, { reason: ' Cleaning ' });

        expect(res.status).toBe(201);
        expect(body.appointment).toMatchObject({
            patientId,
            patientName: 'Juan Dela Cruz',
            startAt: '2026-11-03T01:00:00.000Z',
            date: '2026-11-03',
            time: '09:00',
            durationMinutes: 30,
            reason: 'Cleaning',
            status: 'scheduled',
            walkIn: false,
        });
        expect(body.warnings).toEqual({ overlaps: [], outsideWorkingHours: false });
    });

    it('names the overlapping Appointment but still saves', async () => {
        const session = await signInAsDentist(app);
        const juan = await addPatient(session);
        const maria = await addPatient(session, 'Maria Santos');
        const first = await book(session, juan, { time: '10:00', durationMinutes: 60 });
        const { res, body } = await book(session, maria, { time: '10:30' });

        expect(res.status).toBe(201);
        expect(body.warnings.overlaps).toEqual([
            {
                appointmentId: first.body.appointment.id,
                patientName: 'Juan Dela Cruz',
                startAt: '2026-11-03T02:00:00.000Z',
                durationMinutes: 60,
            },
        ]);
    });

    it('does not count back-to-back Appointments as overlapping', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        await book(session, patientId, { time: '10:00' });
        const { body } = await book(session, patientId, { time: '10:30' });
        expect(body.warnings.overlaps).toEqual([]);
    });

    it('ignores Cancelled Appointments when checking for overlap', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const first = await book(session, patientId, { time: '10:00' });
        await call(session, `/api/appointments/${first.body.appointment.id}/status`, { body: { status: 'cancelled' } });

        const { body } = await book(session, patientId, { time: '10:00' });
        expect(body.warnings.overlaps).toEqual([]);
    });

    it.each([
        ['the lunch break', '2026-11-03', '12:00', 30],
        ['before opening', '2026-11-03', '07:30', 30],
        ['after closing', '2026-11-03', '17:00', 30],
        ['across the start of lunch', '2026-11-03', '11:45', 30],
        ['a Sunday', '2026-11-01', '09:00', 30],
    ])('saves with a Working Hours note for %s', async (_name, date, time, durationMinutes) => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const { res, body } = await book(session, patientId, { date, time, durationMinutes });
        expect(res.status).toBe(201);
        expect(body.warnings.outsideWorkingHours).toBe(true);
    });

    it.each([
        ['the first slot of the morning', '08:00', 30],
        ['the last slot before lunch', '11:30', 30],
        ['the first slot after lunch', '13:00', 30],
        ['ending exactly at closing', '16:30', 30],
    ])('has no Working Hours note for %s', async (_name, time, durationMinutes) => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const { body } = await book(session, patientId, { time, durationMinutes });
        expect(body.warnings.outsideWorkingHours).toBe(false);
    });

    it('treats a Saturday as a working day', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const { body } = await book(session, patientId, { date: '2026-11-07' });
        expect(body.warnings.outsideWorkingHours).toBe(false);
    });

    it('rejects bad input with a message per field and saves nothing', async () => {
        const session = await signInAsDentist(app);
        const { res, body } = await call(session, '/api/appointments', { body: { date: '2026-02-31', time: '25:00', durationMinutes: 2, reason: 'x'.repeat(501) } });

        expect(res.status).toBe(400);
        expect(Object.keys(body.errors).sort()).toEqual(['date', 'durationMinutes', 'patientId', 'reason', 'time']);
        const range = await call(session, '/api/appointments?from=2026-01-01&to=2027-01-01');
        expect(range.body).toEqual([]);
    });

    it('rejects a Patient that does not exist', async () => {
        const session = await signInAsDentist(app);
        const { res, body } = await book(session, 'no-such-patient');
        expect(res.status).toBe(400);
        expect(body.errors.patientId).toBe('Choose a patient.');
    });
});

describe('editing an Appointment', () => {
    it('changes date, time, duration and reason and returns fresh warnings', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const other = await book(session, patientId, { time: '14:00' });
        const mine = await book(session, patientId, { time: '09:00' });

        const { res, body } = await call(session, `/api/appointments/${mine.body.appointment.id}`, {
            method: 'PATCH',
            body: { date: '2026-11-04', time: '14:15', durationMinutes: 45, reason: 'Filling' },
        });

        expect(res.status).toBe(200);
        expect(body.appointment).toMatchObject({ date: '2026-11-04', time: '14:15', durationMinutes: 45, reason: 'Filling' });
        expect(body.warnings.overlaps).toEqual([]);

        const moved = await call(session, `/api/appointments/${mine.body.appointment.id}`, {
            method: 'PATCH',
            body: { date: '2026-11-03', time: '14:15' },
        });
        expect(moved.body.warnings.overlaps.map((o: any) => o.appointmentId)).toEqual([other.body.appointment.id]);
    });

    it('does not warn about overlapping itself', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const mine = await book(session, patientId);
        const { body } = await call(session, `/api/appointments/${mine.body.appointment.id}`, {
            method: 'PATCH',
            body: { date: '2026-11-03', time: '09:10' },
        });
        expect(body.warnings.overlaps).toEqual([]);
    });

    it('answers 404 for an unknown Appointment and 400 for bad input', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const mine = await book(session, patientId);
        expect((await call(session, '/api/appointments/nope', { method: 'PATCH', body: { date: '2026-11-03', time: '09:00' } })).res.status).toBe(404);
        const bad = await call(session, `/api/appointments/${mine.body.appointment.id}`, { method: 'PATCH', body: { date: '', time: '09:00' } });
        expect(bad.res.status).toBe(400);
        expect(bad.body.errors.date).toBe('Choose a date.');
    });
});

describe('Appointment status', () => {
    const setStatus = (session: Session, id: string, status: string) =>
        call(session, `/api/appointments/${id}/status`, { body: { status } });

    it('moves between every status, so a Cancelled or No-show Appointment can return to Scheduled', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const { body } = await book(session, patientId);
        const id = body.appointment.id;

        for (const status of ['completed', 'cancelled', 'scheduled', 'no_show', 'scheduled', 'completed', 'scheduled']) {
            const res = await setStatus(session, id, status);
            expect(res.res.status).toBe(200);
            expect(res.body.appointment.status).toBe(status);
        }
        expect((await call(session, `/api/appointments/${id}`)).body.appointment.status).toBe('scheduled');
    });

    it('warns about an overlap when an Appointment returns to Scheduled', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const first = await book(session, patientId, { time: '10:00' });
        await setStatus(session, first.body.appointment.id, 'cancelled');
        const second = await book(session, patientId, { time: '10:00' });

        const back = await setStatus(session, first.body.appointment.id, 'scheduled');
        expect(back.body.warnings.overlaps.map((o: any) => o.appointmentId)).toEqual([second.body.appointment.id]);
    });

    it('rejects an unknown status and an unknown Appointment', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const { body } = await book(session, patientId);
        expect((await setStatus(session, body.appointment.id, 'late')).res.status).toBe(400);
        expect((await setStatus(session, 'nope', 'completed')).res.status).toBe(404);
    });
});

describe('Walk-in', () => {
    it('creates an Appointment now, rounded down to 5 minutes, with the default duration', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        // 10:07:45 clinic time is 02:07:45 UTC.
        const res = await request('/api/appointments/walk-in', json(session, { patientId }, 'POST', at('2026-11-03T02:07:45Z').headers));
        const body = (await res.json()) as any;

        expect(res.status).toBe(201);
        expect(body.appointment).toMatchObject({
            startAt: '2026-11-03T02:05:00.000Z',
            time: '10:05',
            durationMinutes: 30,
            walkIn: true,
            status: 'scheduled',
        });
        expect(body.warnings).toEqual({ overlaps: [], outsideWorkingHours: false });
    });

    it('notes a Walk-in outside Working Hours', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const res = await request('/api/appointments/walk-in', json(session, { patientId }, 'POST', at('2026-11-01T02:00:00Z').headers));
        expect(((await res.json()) as any).warnings.outsideWorkingHours).toBe(true);
    });

    it('requires a Patient', async () => {
        const session = await signInAsDentist(app);
        expect((await call(session, '/api/appointments/walk-in', { body: {} })).res.status).toBe(400);
    });
});

describe('listing Appointments by date', () => {
    it('returns the clinic days in the range, oldest first, with Patient names', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        await book(session, patientId, { date: '2026-11-04', time: '08:00' });
        await book(session, patientId, { date: '2026-11-03', time: '23:30' });
        await book(session, patientId, { date: '2026-11-02', time: '09:00' });
        await book(session, patientId, { date: '2026-11-05', time: '00:00' });

        const { body } = await call(session, '/api/appointments?from=2026-11-03&to=2026-11-04');
        expect(body.map((a: any) => [a.date, a.time, a.patientName])).toEqual([
            ['2026-11-03', '23:30', 'Juan Dela Cruz'],
            ['2026-11-04', '08:00', 'Juan Dela Cruz'],
        ]);
    });

    it('rejects a missing or backwards range', async () => {
        const session = await signInAsDentist(app);
        expect((await call(session, '/api/appointments')).res.status).toBe(400);
        expect((await call(session, '/api/appointments?from=2026-11-05&to=2026-11-04')).res.status).toBe(400);
    });
});

describe('the Patient Record timeline', () => {
    it('lists Appointments newest first', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        await book(session, patientId, { date: '2026-11-03', reason: 'Older' });
        await book(session, patientId, { date: '2026-12-01', reason: 'Newer' });

        const { body } = await call(session, `/api/patients/${patientId}`);
        expect(body.timeline.map((a: any) => a.reason)).toEqual(['Newer', 'Older']);
    });
});

describe('access', () => {
    it('refuses every Appointment route without a session', async () => {
        for (const [method, path] of [['GET', '/api/appointments?from=2026-11-03&to=2026-11-03'], ['POST', '/api/appointments'], ['POST', '/api/appointments/walk-in'], ['GET', '/api/appointments/x'], ['PATCH', '/api/appointments/x'], ['POST', '/api/appointments/x/status']]) {
            expect((await request(path, { method })).status, `${method} ${path}`).toBe(401);
        }
    });
});
