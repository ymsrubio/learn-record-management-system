import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import { request } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';

type Session = Awaited<ReturnType<typeof signInAsDentist>>;

// Asia/Manila is UTC+8. 15:59:59Z on the 3rd is 23:59:59 in Manila, one second before midnight.
const NIGHT = '2026-11-03T15:59:59Z';
const MIDNIGHT = '2026-11-03T16:00:00Z'; // 00:00:00 on the 4th in Manila
const MORNING = '2026-11-03T01:00:00Z'; // 09:00 on the 3rd

async function call(session: Session, method: string, path: string, now: string, body?: unknown) {
    const res = await request(path, {
        method,
        headers: { ...session.headers, 'content-type': 'application/json', 'X-Test-Now': now },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { res, body: (await res.json()) as any };
}

const NOTE = { findings: 'Cavity on 16', treatmentDone: 'Filled 16', nextSteps: 'Review in 6 months' };

async function completedAppointment(session: Session, status = 'completed') {
    const patient = await call(session, 'POST', '/api/patients', MORNING, { fullName: 'Juan Dela Cruz', mobilePhone: '09171234567' });
    const patientId = patient.body.patient.id as string;
    const appt = await call(session, 'POST', '/api/appointments', MORNING, { patientId, date: '2026-11-03', time: '09:00' });
    const id = appt.body.appointment.id as string;
    if (status !== 'scheduled') await call(session, 'POST', `/api/appointments/${id}/status`, MORNING, { status });
    return { patientId, id };
}

const writeNote = (session: Session, id: string, now = MORNING, body: unknown = NOTE) =>
    call(session, 'POST', `/api/appointments/${id}/note`, now, body);

describe('writing a Treatment Note', () => {
    it('saves Findings, Treatment done and Next steps on a Completed Appointment', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);

        const { res, body } = await writeNote(session, id);

        expect(res.status).toBe(201);
        expect(body.note).toMatchObject({ ...NOTE, appointmentId: id, writtenBy: 'Maria Santos', locked: false, amendments: [] });
        expect(body.note.writtenAt).toBe(MORNING.replace('Z', '.000Z'));
    });

    it.each(['scheduled', 'cancelled', 'no_show'])('is refused on a %s Appointment', async (status) => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session, status);

        const { res, body } = await writeNote(session, id);

        expect(res.status).toBe(409);
        expect(body.code).toBe('appointment_not_completed');
        const read = await call(session, 'GET', `/api/appointments/${id}/note`, MORNING);
        expect(read.body.note).toBeNull();
    });

    it('allows only one note per Appointment', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);
        await writeNote(session, id);

        const { res, body } = await writeNote(session, id, MORNING, { ...NOTE, findings: 'Second try' });

        expect(res.status).toBe(409);
        expect(body.code).toBe('note_exists');
        const read = await call(session, 'GET', `/api/appointments/${id}/note`, MORNING);
        expect(read.body.note.findings).toBe('Cavity on 16');
    });

    it('asks for Findings and Treatment done, and leaves Next steps optional', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);

        const bad = await writeNote(session, id, MORNING, { findings: '  ', treatmentDone: '' });
        expect(bad.res.status).toBe(400);
        expect(bad.body.errors).toEqual({ findings: 'Write what you found.', treatmentDone: 'Write what was done.' });

        const ok = await writeNote(session, id, MORNING, { findings: 'Gingivitis', treatmentDone: 'Scaling' });
        expect(ok.res.status).toBe(201);
        expect(ok.body.note.nextSteps).toBeNull();
    });

    it('answers 404 for an unknown Appointment and needs a session', async () => {
        const session = await signInAsDentist(app);
        expect((await writeNote(session, 'nope')).res.status).toBe(404);
        const anon = await request('/api/appointments/nope/note');
        expect(anon.status).toBe(401);
    });
});

describe('editing a Treatment Note', () => {
    it('lets the Dentist edit a note written today, up to the last second of the clinic day', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);
        await writeNote(session, id);

        const { res, body } = await call(session, 'PATCH', `/api/appointments/${id}/note`, NIGHT, { ...NOTE, treatmentDone: 'Filled 16 and 17' });

        expect(res.status).toBe(200);
        expect(body.note).toMatchObject({ treatmentDone: 'Filled 16 and 17', locked: false });
        // Editing does not move the day it was written, which is what locks it.
        expect(body.note.writtenAt).toBe(MORNING.replace('Z', '.000Z'));
    });

    it('locks at midnight in Manila and refuses edits with note_locked', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);
        await writeNote(session, id);

        const { res, body } = await call(session, 'PATCH', `/api/appointments/${id}/note`, MIDNIGHT, { ...NOTE, findings: 'Rewritten' });

        expect(res.status).toBe(409);
        expect(body.code).toBe('note_locked');
        const read = await call(session, 'GET', `/api/appointments/${id}/note`, MIDNIGHT);
        expect(read.body.note).toMatchObject({ findings: 'Cavity on 16', locked: true });
    });

    it('treats a note written at 23:59 Manila as locked a minute later, though UTC is still the same day', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);
        await writeNote(session, id, NIGHT);

        const before = await call(session, 'GET', `/api/appointments/${id}/note`, NIGHT);
        const after = await call(session, 'GET', `/api/appointments/${id}/note`, '2026-11-03T16:00:30Z');

        expect(before.body.note.locked).toBe(false);
        expect(after.body.note.locked).toBe(true);
    });

    it('answers 404 when the Appointment has no note yet', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);
        const { res, body } = await call(session, 'PATCH', `/api/appointments/${id}/note`, MORNING, NOTE);
        expect(res.status).toBe(404);
        expect(body.code).toBe('note_not_found');
    });
});

describe('Amendments', () => {
    const lockedNote = async (session: Session) => {
        const { id } = await completedAppointment(session);
        await writeNote(session, id);
        return id;
    };

    it('are refused while the note can still be edited', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);
        await writeNote(session, id);

        const { res, body } = await call(session, 'POST', `/api/appointments/${id}/note/amendments`, NIGHT, { text: 'Typo' });

        expect(res.status).toBe(409);
        expect(body.code).toBe('note_not_locked');
    });

    it('are added to a Locked note with author and time, leaving the original as written', async () => {
        const session = await signInAsDentist(app);
        const id = await lockedNote(session);
        const next = '2026-11-04T02:15:00Z';

        const { res, body } = await call(session, 'POST', `/api/appointments/${id}/note/amendments`, next, { text: ' It was tooth 17, not 16. ' });

        expect(res.status).toBe(201);
        expect(body.note).toMatchObject({ ...NOTE, locked: true });
        expect(body.note.amendments).toEqual([
            { id: expect.any(String), text: 'It was tooth 17, not 16.', writtenBy: 'Maria Santos', writtenAt: '2026-11-04T02:15:00.000Z' },
        ]);
    });

    it('keep their order and never change the original', async () => {
        const session = await signInAsDentist(app);
        const id = await lockedNote(session);
        await call(session, 'POST', `/api/appointments/${id}/note/amendments`, '2026-11-04T02:00:00Z', { text: 'First' });
        await call(session, 'POST', `/api/appointments/${id}/note/amendments`, '2026-11-05T02:00:00Z', { text: 'Second' });

        const read = await call(session, 'GET', `/api/appointments/${id}/note`, '2026-11-06T02:00:00Z');

        expect(read.body.note.amendments.map((a: any) => a.text)).toEqual(['First', 'Second']);
        expect(read.body.note).toMatchObject(NOTE);
    });

    it('need some text', async () => {
        const session = await signInAsDentist(app);
        const id = await lockedNote(session);
        const { res, body } = await call(session, 'POST', `/api/appointments/${id}/note/amendments`, '2026-11-04T02:00:00Z', { text: ' ' });
        expect(res.status).toBe(400);
        expect(body.errors.text).toBe('Write the correction.');
    });

    it('have no route to change or remove them', async () => {
        const session = await signInAsDentist(app);
        const id = await lockedNote(session);
        const created = await call(session, 'POST', `/api/appointments/${id}/note/amendments`, '2026-11-04T02:00:00Z', { text: 'First' });
        const amendmentId = created.body.note.amendments[0].id;
        for (const method of ['PATCH', 'PUT', 'DELETE']) {
            const res = await request(`/api/appointments/${id}/note/amendments/${amendmentId}`, { method, headers: session.headers });
            expect(res.status).toBe(404);
        }
    });
});

describe('a Completed Appointment with a Treatment Note', () => {
    it('stays Completed (409 completed_has_note) and reports its status as locked', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);
        const before = await call(session, 'GET', `/api/appointments/${id}`, MORNING);
        expect(before.body.appointment.statusLocked).toBe(false);
        await writeNote(session, id);

        const refused = await call(session, 'POST', `/api/appointments/${id}/status`, MORNING, { status: 'cancelled' });

        expect(refused.res.status).toBe(409);
        expect(refused.body.code).toBe('completed_has_note');
        const after = await call(session, 'GET', `/api/appointments/${id}`, MORNING);
        expect(after.body.appointment).toMatchObject({ status: 'completed', statusLocked: true });
    });

    it('reports statusLocked in the Schedule range query too', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);
        await writeNote(session, id);
        const list = await call(session, 'GET', '/api/appointments?from=2026-11-03&to=2026-11-03', MORNING);
        expect(list.body.map((a: any) => [a.id, a.statusLocked])).toEqual([[id, true]]);
    });

    it('can still change status when it has no note', async () => {
        const session = await signInAsDentist(app);
        const { id } = await completedAppointment(session);
        const { res, body } = await call(session, 'POST', `/api/appointments/${id}/status`, MORNING, { status: 'scheduled' });
        expect(res.status).toBe(200);
        expect(body.appointment).toMatchObject({ status: 'scheduled', statusLocked: false });
    });
});

describe('the note screen data and the timeline', () => {
    const intake = {
        personal: { fullName: 'Juan Dela Cruz', birthdate: '1990-03-14', sex: 'male', occupation: 'Teacher', mobilePhone: '09171234567', address: '12 Rizal St', emergencyContactName: 'Ben', emergencyContactPhone: '09181112222' },
        medical: { seriousIllness: false, bloodTransfusion: false, allergies: ['penicillin'], allergiesOther: 'Latex' },
        dental: { visitReason: 'Toothache', brushFrequency: 'Twice a day', flossFrequency: 'Rarely' },
        consent: true,
    };

    it("returns the Patient's Medical History alerts alongside the note", async () => {
        const session = await signInAsDentist(app);
        const { id, patientId } = await completedAppointment(session);
        const submitted = await call(session, 'POST', `/api/patients/${patientId}/intake`, MORNING, intake);
        expect(submitted.res.status).toBe(200);

        const { body } = await call(session, 'GET', `/api/appointments/${id}/note`, MORNING);

        expect(body.alerts).toEqual(['Allergy: Penicillin', 'Allergy: Latex']);
        expect(body.appointment).toMatchObject({ id, patientId, patientName: 'Juan Dela Cruz', status: 'completed' });
        expect(body.note).toBeNull();
    });

    it('puts the note, its lock state and Amendments on the Patient Record timeline', async () => {
        const session = await signInAsDentist(app);
        const { id, patientId } = await completedAppointment(session);
        await writeNote(session, id);
        await call(session, 'POST', `/api/appointments/${id}/note/amendments`, '2026-11-04T02:00:00Z', { text: 'Tooth 17' });

        const sameDay = await call(session, 'GET', `/api/patients/${patientId}`, MORNING);
        expect(sameDay.body.timeline[0].note).toMatchObject({ locked: false });

        const nextDay = await call(session, 'GET', `/api/patients/${patientId}`, '2026-11-04T03:00:00Z');
        expect(nextDay.body.timeline[0].note).toMatchObject({ ...NOTE, locked: true, amendments: [{ text: 'Tooth 17' }] });
    });

    it('gives an Appointment without a note a null note', async () => {
        const session = await signInAsDentist(app);
        const { patientId } = await completedAppointment(session);
        const { body } = await call(session, 'GET', `/api/patients/${patientId}`, MORNING);
        expect(body.timeline[0].note).toBeNull();
    });
});
