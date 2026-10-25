import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import { request } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';

type Session = Awaited<ReturnType<typeof signInAsDentist>>;

// 2026-11-03 is a Tuesday. 09:00 in Manila is 01:00 UTC.
const MORNING = '2026-11-03T01:00:00Z';
const NEXT_DAY = '2026-11-04T01:00:00Z';

async function call(session: Session, method: string, path: string, body?: unknown, now = MORNING) {
    const res = await request(path, {
        method,
        headers: { ...session.headers, 'content-type': 'application/json', 'X-Test-Now': now },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { res, body: (text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text) as any };
}

const NOTE = { findings: 'Cavity on 16', treatmentDone: 'Filled 16', nextSteps: 'Review in 6 months' };

// A Patient with a Completed Appointment that has a Treatment Note, and a Scheduled one.
async function patientWithHistory(session: Session) {
    const p = await call(session, 'POST', '/api/patients', { fullName: 'Juan Dela Cruz', mobilePhone: '09171234567' });
    const patientId = p.body.patient.id as string;
    const done = await call(session, 'POST', '/api/appointments', { patientId, date: '2026-11-03', time: '09:00' });
    const doneId = done.body.appointment.id as string;
    await call(session, 'POST', `/api/appointments/${doneId}/status`, { status: 'completed' });
    await call(session, 'POST', `/api/appointments/${doneId}/note`, NOTE);
    const later = await call(session, 'POST', '/api/appointments', { patientId, date: '2026-11-10', time: '10:00' });
    return { patientId, doneId, scheduledId: later.body.appointment.id as string };
}

const archive = (s: Session, id: string, now = MORNING) => call(s, 'POST', `/api/patients/${id}/archive`, undefined, now);
const restore = (s: Session, id: string) => call(s, 'POST', `/api/patients/${id}/restore`);

describe('archiving a Patient', () => {
    it('marks the Patient Archived and keeps the whole timeline', async () => {
        const s = await signInAsDentist(app);
        const { patientId } = await patientWithHistory(s);

        const { res, body } = await archive(s, patientId);

        expect(res.status).toBe(200);
        expect(body.patient.flags.archived).toBe(true);
        const rec = await call(s, 'GET', `/api/patients/${patientId}`);
        expect(rec.body.patient.flags.archived).toBe(true);
        expect(rec.body.timeline).toHaveLength(2);
        expect(rec.body.timeline.find((a: any) => a.status === 'completed').note.findings).toBe('Cavity on 16');
    });

    it('is a no-op when the Patient is already Archived', async () => {
        const s = await signInAsDentist(app);
        const { patientId } = await patientWithHistory(s);
        await archive(s, patientId);

        const again = await archive(s, patientId, NEXT_DAY);

        expect(again.res.status).toBe(200);
        expect(again.body.patient.flags.archived).toBe(true);
    });

    it('is 404 for a Patient that does not exist', async () => {
        const s = await signInAsDentist(app);
        expect((await archive(s, 'nope')).res.status).toBe(404);
        expect((await restore(s, 'nope')).res.status).toBe(404);
    });

    it('needs a signed-in User', async () => {
        expect((await request('/api/patients/x/archive', { method: 'POST' })).status).toBe(401);
        expect((await request('/api/patients/x/restore', { method: 'POST' })).status).toBe(401);
    });

    it('has no delete endpoint', async () => {
        const s = await signInAsDentist(app);
        const { patientId, doneId } = await patientWithHistory(s);
        expect((await call(s, 'DELETE', `/api/patients/${patientId}`)).res.status).toBe(404);
        expect((await call(s, 'DELETE', `/api/appointments/${doneId}`)).res.status).toBe(404);
        expect((await call(s, 'GET', `/api/patients/${patientId}`)).res.status).toBe(200);
    });
});

describe('search and the Archived Patient', () => {
    it('leaves them out of search, finds them with includeArchived, and drops them from the recently seen list', async () => {
        const s = await signInAsDentist(app);
        const { patientId } = await patientWithHistory(s);
        await archive(s, patientId);

        const plain = await call(s, 'GET', '/api/patients/search?q=dela');
        const all = await call(s, 'GET', '/api/patients/search?q=dela&includeArchived=true');
        const recent = await call(s, 'GET', '/api/patients/recent');

        expect(JSON.stringify(plain.body)).not.toContain(patientId);
        expect(JSON.stringify(all.body)).toContain(patientId);
        expect(JSON.stringify(recent.body)).not.toContain(patientId);
    });
});

describe('every write about an Archived Patient is refused', () => {
    async function archived() {
        const s = await signInAsDentist(app);
        const ids = await patientWithHistory(s);
        await archive(s, ids.patientId);
        return { s, ...ids };
    }
    const refused = (r: { res: Response; body: any }) => {
        expect(r.res.status).toBe(409);
        expect(r.body.code).toBe('patient_archived');
    };

    it('edit details', async () => {
        const { s, patientId } = await archived();
        refused(await call(s, 'PATCH', `/api/patients/${patientId}`, { fullName: 'Changed Name', mobilePhone: '09171234567', birthdate: null }));
        const rec = await call(s, 'GET', `/api/patients/${patientId}`);
        expect(rec.body.patient.fullName).toBe('Juan Dela Cruz');
    });

    it('Intake', async () => {
        const { s, patientId } = await archived();
        const body = {
            personal: { fullName: 'Juan Dela Cruz', birthdate: '1990-03-14', sex: 'male', occupation: 'Teacher', mobilePhone: '09171234567', address: '12 Rizal St', emergencyContactName: 'Ben', emergencyContactPhone: '09181112222' },
            medical: { seriousIllness: false, bloodTransfusion: false },
            dental: { visitReason: 'Toothache', brushFrequency: 'Twice a day', flossFrequency: 'Rarely' },
            consent: true,
        };
        refused(await call(s, 'POST', `/api/patients/${patientId}/intake`, body));
        const rec = await call(s, 'GET', `/api/patients/${patientId}`);
        expect(rec.body.patient.flags.pendingIntake).toBe(true);
    });

    it('new Appointment and new Walk-in', async () => {
        const { s, patientId } = await archived();
        refused(await call(s, 'POST', '/api/appointments', { patientId, date: '2026-11-12', time: '09:00' }));
        refused(await call(s, 'POST', '/api/appointments/walk-in', { patientId }));
    });

    it('Appointment edit and status change', async () => {
        const { s, scheduledId } = await archived();
        refused(await call(s, 'PATCH', `/api/appointments/${scheduledId}`, { date: '2026-11-11', time: '09:00', durationMinutes: 30 }));
        refused(await call(s, 'POST', `/api/appointments/${scheduledId}/status`, { status: 'cancelled' }));
        const rec = await call(s, 'GET', `/api/appointments/${scheduledId}`);
        expect(rec.body.appointment.status).toBe('scheduled');
    });

    it('Treatment Note edit and Amendment', async () => {
        const { s, doneId } = await archived();
        refused(await call(s, 'PATCH', `/api/appointments/${doneId}/note`, NOTE));
        refused(await call(s, 'POST', `/api/appointments/${doneId}/note/amendments`, { text: 'Late correction' }, NEXT_DAY));
        const note = await call(s, 'GET', `/api/appointments/${doneId}/note`);
        expect(note.body.note.amendments).toEqual([]);
    });
});

describe('restoring a Patient', () => {
    it('clears the Archive and allows writes and search again', async () => {
        const s = await signInAsDentist(app);
        const { patientId, scheduledId } = await patientWithHistory(s);
        await archive(s, patientId);

        const { res, body } = await restore(s, patientId);

        expect(res.status).toBe(200);
        expect(body.patient.flags.archived).toBe(false);
        const edit = await call(s, 'PATCH', `/api/patients/${patientId}`, { fullName: 'Juan D. Cruz', mobilePhone: '09171234567', birthdate: null });
        expect(edit.res.status).toBe(200);
        const status = await call(s, 'POST', `/api/appointments/${scheduledId}/status`, { status: 'cancelled' });
        expect(status.res.status).toBe(200);
        const found = await call(s, 'GET', '/api/patients/search?q=cruz');
        expect(JSON.stringify(found.body)).toContain(patientId);
    });

    it('is a no-op for a Patient who is not Archived', async () => {
        const s = await signInAsDentist(app);
        const { patientId } = await patientWithHistory(s);
        const { res, body } = await restore(s, patientId);
        expect(res.status).toBe(200);
        expect(body.patient.flags.archived).toBe(false);
    });
});

describe('the Dashboard and the Archived Patient', () => {
    it('does not ask for a status update on an Appointment nobody can change, and skips Pending Intake', async () => {
        const s = await signInAsDentist(app);
        const { patientId } = await patientWithHistory(s);
        const later = '2026-11-20T01:00:00Z';
        const before = await call(s, 'GET', '/api/dashboard', undefined, later);
        expect(before.body.needsStatusUpdate.length).toBeGreaterThan(0);

        await archive(s, patientId);
        const after = await call(s, 'GET', '/api/dashboard', undefined, later);

        expect(after.body.needsStatusUpdate).toEqual([]);
        expect(after.body.pendingIntake).toEqual([]);
    });

    it('still shows the Archived Patient\'s Appointment on the Schedule, flagged read-only', async () => {
        const s = await signInAsDentist(app);
        const { patientId, scheduledId } = await patientWithHistory(s);
        await archive(s, patientId);

        const list = await call(s, 'GET', '/api/appointments?from=2026-11-09&to=2026-11-16');

        const item = list.body.find((a: any) => a.id === scheduledId);
        expect(item).toMatchObject({ patientName: 'Juan Dela Cruz', patientArchived: true });
    });
});
