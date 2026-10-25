import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import { at, request } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';

type Session = Awaited<ReturnType<typeof signInAsDentist>>;

const send = (session: Session, body: unknown, extra: Record<string, string> = {}): RequestInit => ({
    method: 'POST',
    headers: { ...session.headers, 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
});

async function addPatient(session: Session, fullName = 'Juan Dela Cruz') {
    const res = await request('/api/patients', send(session, { fullName, mobilePhone: '09171234567' }));
    return ((await res.json()) as any).patient.id as string;
}

async function book(session: Session, patientId: string, date: string, time: string, over: Record<string, unknown> = {}) {
    const res = await request('/api/appointments', send(session, { patientId, date, time, ...over }));
    return ((await res.json()) as any).appointment.id as string;
}

async function summary(session: Session, now: string) {
    const res = await request('/api/dashboard', { headers: { ...session.headers, ...at(now).headers } });
    return { res, body: (await res.json()) as any };
}

// 2026-11-03 is a Tuesday. 09:00 in Manila is 01:00 UTC.
describe('the Dashboard summary', () => {
    it('needs a signed-in User', async () => {
        expect((await request('/api/dashboard')).status).toBe(401);
    });

    it('says the clinic is empty when there is no data at all', async () => {
        const session = await signInAsDentist(app);
        const { body } = await summary(session, '2026-11-03T00:00:00Z');
        expect(body).toMatchObject({ today: '2026-11-03', todaysAppointments: [], needsStatusUpdate: [], pendingIntake: [], clinicIsEmpty: true });
        expect(body.nextDays).toHaveLength(7);
    });

    it('lists today in time order and marks the next upcoming one', async () => {
        const session = await signInAsDentist(app);
        const juan = await addPatient(session);
        const late = await book(session, juan, '2026-11-03', '14:00', { reason: 'Filling' });
        const early = await book(session, juan, '2026-11-03', '09:00');
        const mid = await book(session, juan, '2026-11-03', '11:00');
        await request(`/api/appointments/${early}/status`, send(session, { status: 'completed' }));

        // 10:00 Manila: the 09:00 one is done, 11:00 is next.
        const { body } = await summary(session, '2026-11-03T02:00:00Z');
        expect(body.todaysAppointments.map((a: any) => [a.id, a.time])).toEqual([[early, '09:00'], [mid, '11:00'], [late, '14:00']]);
        expect(body.nextAppointmentId).toBe(mid);
        expect(body.todaysAppointments[2]).toMatchObject({ patientName: 'Juan Dela Cruz', reason: 'Filling', status: 'scheduled' });
        expect(body.clinicIsEmpty).toBe(false);
    });

    it('still counts an Appointment in progress as the next one', async () => {
        const session = await signInAsDentist(app);
        const id = await book(session, await addPatient(session), '2026-11-03', '09:00');
        const { body } = await summary(session, '2026-11-03T01:10:00Z');
        expect(body.nextAppointmentId).toBe(id);
    });

    it('has no next Appointment once the day is over', async () => {
        const session = await signInAsDentist(app);
        await book(session, await addPatient(session), '2026-11-03', '09:00');
        const { body } = await summary(session, '2026-11-03T09:00:00Z');
        expect(body.nextAppointmentId).toBeNull();
    });

    it('uses the clinic date around midnight in Asia/Manila', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const tuesday = await book(session, patientId, '2026-11-03', '00:30');
        const monday = await book(session, patientId, '2026-11-02', '23:30');

        // 15:59 UTC on the 2nd is 23:59 Manila on Monday the 2nd.
        const before = await summary(session, '2026-11-02T15:59:00Z');
        expect(before.body.today).toBe('2026-11-02');
        expect(before.body.todaysAppointments.map((a: any) => a.id)).toEqual([monday]);

        // One minute later it is Tuesday the 3rd in Manila, though still the 2nd in UTC.
        const after = await summary(session, '2026-11-02T16:00:00Z');
        expect(after.body.today).toBe('2026-11-03');
        expect(after.body.todaysAppointments.map((a: any) => a.id)).toEqual([tuesday]);
        expect(after.body.needsStatusUpdate.map((a: any) => a.id)).toEqual([monday]);
    });

    it('lists earlier Appointments still Scheduled, oldest first, and leaves resolved ones out', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        const older = await book(session, patientId, '2026-10-30', '09:00');
        const yesterday = await book(session, patientId, '2026-11-02', '09:00');
        const done = await book(session, patientId, '2026-11-02', '10:00');
        const gone = await book(session, patientId, '2026-11-02', '11:00');
        await request(`/api/appointments/${done}/status`, send(session, { status: 'completed' }));
        await request(`/api/appointments/${gone}/status`, send(session, { status: 'no_show' }));
        await book(session, patientId, '2026-11-03', '09:00');

        const { body } = await summary(session, '2026-11-03T00:00:00Z');
        expect(body.needsStatusUpdate.map((a: any) => a.id)).toEqual([older, yesterday]);
    });

    it('lists Patients booked by phone who have not done their Intake', async () => {
        const session = await signInAsDentist(app);
        await addPatient(session, 'Ana Reyes');
        const { body } = await summary(session, '2026-11-03T00:00:00Z');
        expect(body.pendingIntake).toMatchObject([{ fullName: 'Ana Reyes', mobilePhone: '09171234567' }]);
    });

    it('counts non-cancelled Appointments for today and the next six days', async () => {
        const session = await signInAsDentist(app);
        const patientId = await addPatient(session);
        await book(session, patientId, '2026-11-03', '09:00');
        await book(session, patientId, '2026-11-03', '10:00');
        const cancelled = await book(session, patientId, '2026-11-03', '11:00');
        await request(`/api/appointments/${cancelled}/status`, send(session, { status: 'cancelled' }));
        await book(session, patientId, '2026-11-05', '09:00');
        await book(session, patientId, '2026-11-09', '09:00');
        await book(session, patientId, '2026-11-10', '09:00');

        const { body } = await summary(session, '2026-11-03T00:00:00Z');
        expect(body.nextDays).toEqual([
            { date: '2026-11-03', count: 2 },
            { date: '2026-11-04', count: 0 },
            { date: '2026-11-05', count: 1 },
            { date: '2026-11-06', count: 0 },
            { date: '2026-11-07', count: 0 },
            { date: '2026-11-08', count: 0 },
            { date: '2026-11-09', count: 1 },
        ]);
        expect(body.todaysAppointments).toHaveLength(3);
    });
});
