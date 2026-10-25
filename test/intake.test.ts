import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import { CONDITIONS, SYMPTOMS } from '../worker/intake/lists';
import { request } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';

type Session = Awaited<ReturnType<typeof signInAsDentist>>;

const NOW = '2026-11-05T16:30:00Z'; // 6 Nov 00:30 in Manila: the clinic date is already the 6th

const send = (session: Session, method: string, body?: unknown) => ({
    method,
    headers: { ...session.headers, 'content-type': 'application/json', 'X-Test-Now': NOW },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

async function quickAdd(session: Session, fullName = 'Maria Santos', mobilePhone = '09171234567') {
    const res = await request('/api/patients', send(session, 'POST', { fullName, mobilePhone }));
    return ((await res.json()) as any).patient.id as string;
}

const adult = (overrides: Record<string, unknown> = {}) => ({
    fullName: 'Maria Santos',
    birthdate: '1990-03-14',
    sex: 'male',
    occupation: 'Teacher',
    mobilePhone: '09171234567',
    address: '12 Rizal St, Iligan City',
    emergencyContactName: 'Ben Santos',
    emergencyContactPhone: '09181112222',
    ...overrides,
});

const intake = (over: { personal?: Record<string, unknown>; medical?: Record<string, unknown>; guardian?: unknown; consent?: unknown } = {}) => ({
    personal: adult(over.personal),
    ...(over.guardian !== undefined && { guardian: over.guardian }),
    medical: { seriousIllness: false, bloodTransfusion: false, ...over.medical },
    dental: { visitReason: 'Toothache', brushFrequency: 'Twice a day', flossFrequency: 'Rarely' },
    consent: over.consent === undefined ? true : over.consent,
});

const submit = async (session: Session, id: string, body: unknown) => {
    const res = await request(`/api/patients/${id}/intake`, send(session, 'POST', body));
    return { res, body: (await res.json()) as any };
};
const record = async (session: Session, id: string) =>
    (await (await request(`/api/patients/${id}`, send(session, 'GET'))).json()) as any;

describe('submitting an Intake', () => {
    it('saves the whole Intake and clears Pending Intake', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);

        const { res, body } = await submit(session, id, intake({ personal: { previousSurname: 'Reyes', landline: '221-3914' } }));

        expect(res.status).toBe(200);
        expect(body.consentGivenOn).toBe('2026-11-06');
        const rec = await record(session, id);
        expect(rec.patient.flags.pendingIntake).toBe(false);
        expect(rec.patient).toMatchObject({ birthdate: '1990-03-14', age: 36 });
        expect(rec.details).toMatchObject({
            previousSurname: 'Reyes',
            occupation: 'Teacher',
            landline: '221-3914',
            address: '12 Rizal St, Iligan City',
            emergencyContactName: 'Ben Santos',
        });
        expect(rec.consentGivenOn).toBe('2026-11-06');
        expect(rec.guardian).toBeNull();
    });

    it('takes the consent date from the clinic calendar, not UTC', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const res = await request(`/api/patients/${id}/intake`, {
            ...send(session, 'POST', intake()),
            headers: { ...send(session, 'POST').headers, 'X-Test-Now': '2026-11-05T15:59:00Z' },
        });
        expect(((await res.json()) as any).consentGivenOn).toBe('2026-11-05');
    });

    it('rejects an unknown Patient', async () => {
        const session = await signInAsDentist(app);
        expect((await submit(session, 'nope', intake())).res.status).toBe(404);
    });
});

describe('Guardian', () => {
    const child = { birthdate: '2015-08-01' };
    const guardian = { name: 'Rosa Santos', relationship: 'Mother', phone: '0917 555 0100' };

    it('is required when the Patient is under 18, and the error is on the Guardian', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { res, body } = await submit(session, id, intake({ personal: child }));
        expect(res.status).toBe(400);
        expect(body.errors).toEqual({ guardian: 'A Guardian is required for a Patient under 18.' });
        expect((await record(session, id)).patient.flags.pendingIntake).toBe(true);
    });

    it('needs its name, relationship and phone', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { body } = await submit(session, id, intake({ personal: child, guardian: { name: ' ' } }));
        expect(Object.keys(body.errors).sort()).toEqual(['guardian.name', 'guardian.phone', 'guardian.relationship']);
    });

    it('is not required for an adult, and turning 18 today counts as an adult', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { res } = await submit(session, id, intake({ personal: { birthdate: '2008-11-06' } }));
        expect(res.status).toBe(200);
        expect((await record(session, id)).guardian).toBeNull();
    });

    it('shows on the Patient Record', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session, 'Ana Santos');
        await submit(session, id, intake({ personal: child, guardian }));
        expect((await record(session, id)).guardian).toMatchObject(guardian);
    });

    it('is shared by siblings, and an edit shows on both', async () => {
        const session = await signInAsDentist(app);
        const first = await quickAdd(session, 'Ana Santos', '09171234567');
        const second = await quickAdd(session, 'Leo Santos', '09171234567');
        await submit(session, first, intake({ personal: { ...child, fullName: 'Ana Santos' }, guardian }));

        const found = (await (await request('/api/guardians?phone=%2B63%20917%20555%200100', send(session, 'GET'))).json()) as any;
        expect(found.guardians).toHaveLength(1);

        await submit(session, second, intake({ personal: { ...child, fullName: 'Leo Santos' }, guardian: { ...guardian, id: found.guardians[0].id } }));
        const edited = { ...guardian, id: found.guardians[0].id, phone: '0917 555 0199' };
        await submit(session, first, intake({ personal: { ...child, fullName: 'Ana Santos' }, guardian: edited }));

        const a = await record(session, first);
        const b = await record(session, second);
        expect(a.guardian.id).toBe(b.guardian.id);
        expect(b.guardian.phone).toBe('0917 555 0199');
    });

    it('rejects a Guardian id that does not exist', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { res } = await submit(session, id, intake({ personal: child, guardian: { ...guardian, id: 'ghost' } }));
        expect(res.status).toBe(400);
    });
});

describe('Medical History rules', () => {
    it('needs a description when serious illness is yes', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { res, body } = await submit(session, id, intake({ medical: { seriousIllness: true } }));
        expect(res.status).toBe(400);
        expect(body.errors).toEqual({ 'medical.seriousIllnessDetails': 'Describe the illness or operation.' });
    });

    it('needs the female-only answers when sex is female', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { body } = await submit(session, id, intake({ personal: { sex: 'female' } }));
        expect(Object.keys(body.errors).sort()).toEqual(['medical.birthControl', 'medical.nursing', 'medical.pregnant']);
        const ok = await submit(session, id, intake({ personal: { sex: 'female' }, medical: { pregnant: false, nursing: false, birthControl: true } }));
        expect(ok.res.status).toBe(200);
    });

    it('rejects the female-only answers when sex is not female', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { res, body } = await submit(session, id, intake({ medical: { pregnant: false } }));
        expect(res.status).toBe(400);
        expect(Object.keys(body.errors)).toEqual(['medical.pregnant']);
    });

    it('rejects a condition or symptom that is not on the list', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { body } = await submit(session, id, { ...intake({ medical: { conditions: ['made-up'] } }), dental: { visitReason: 'x', brushFrequency: 'x', flossFrequency: 'x', symptoms: ['made-up'] } });
        expect(Object.keys(body.errors).sort()).toEqual(['dental.symptoms', 'medical.conditions']);
    });

    it('has the 46 conditions and 12 symptoms from the paper form', () => {
        expect(CONDITIONS).toHaveLength(46);
        expect(SYMPTOMS).toHaveLength(12);
    });
});

describe('consent and validation at the API', () => {
    it('refuses an Intake without consent', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        for (const consent of [false, 'yes', null]) {
            const { res, body } = await submit(session, id, intake({ consent }));
            expect(res.status).toBe(400);
            expect(body.errors).toEqual({ consent: 'Tick the box to give consent.' });
        }
        expect((await record(session, id)).patient.flags.pendingIntake).toBe(true);
    });

    it('rejects an empty body with a message per field and saves nothing', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { res, body } = await submit(session, id, {});
        expect(res.status).toBe(400);
        expect(Object.keys(body.errors).sort()).toEqual([
            'consent',
            'dental.brushFrequency',
            'dental.flossFrequency',
            'dental.visitReason',
            'medical.bloodTransfusion',
            'medical.seriousIllness',
            'personal.address',
            'personal.birthdate',
            'personal.emergencyContactName',
            'personal.emergencyContactPhone',
            'personal.fullName',
            'personal.mobilePhone',
            'personal.occupation',
            'personal.sex',
        ]);
        expect((await record(session, id)).details.address).toBeNull();
    });

    it('rejects a future birthdate, a bad phone and a bad email', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        const { body } = await submit(session, id, intake({ personal: { birthdate: '2027-01-01', mobilePhone: 'call me', email: 'nope' } }));
        expect(Object.keys(body.errors).sort()).toEqual(['personal.birthdate', 'personal.email', 'personal.mobilePhone']);
    });

    it('requires a signed-in User', async () => {
        const id = 'any';
        expect((await request(`/api/patients/${id}/intake`, { method: 'POST' })).status).toBe(401);
        expect((await request('/api/guardians?phone=09171234567')).status).toBe(401);
    });
});

describe('Medical History alerts', () => {
    it('are empty before the Intake', async () => {
        const session = await signInAsDentist(app);
        expect((await record(session, await quickAdd(session))).alerts).toEqual([]);
    });

    it('list allergies first, then conditions, pregnancy and nursing, then medications', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        await submit(
            session,
            id,
            intake({
                personal: { sex: 'female' },
                medical: {
                    conditions: ['diabetes', 'high-blood-pressure'],
                    pregnant: true,
                    nursing: false,
                    birthControl: false,
                    medications: 'Warfarin 5mg',
                    allergies: ['penicillin', 'aspirin'],
                    allergiesOther: 'Latex',
                },
            }),
        );
        expect((await record(session, id)).alerts).toEqual([
            'Allergy: Aspirin',
            'Allergy: Penicillin',
            'Allergy: Latex',
            'Diabetes',
            'High blood pressure',
            'Pregnant',
            'Medications: Warfarin 5mg',
        ]);
    });

    it('follow a corrected Intake', async () => {
        const session = await signInAsDentist(app);
        const id = await quickAdd(session);
        await submit(session, id, intake({ medical: { allergies: ['codeine'] } }));
        await submit(session, id, intake({ medical: { allergies: [] } }));
        expect((await record(session, id)).alerts).toEqual([]);
    });
});
