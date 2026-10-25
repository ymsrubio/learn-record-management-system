import { ageOn } from '../clock';
import type { FieldErrors, Result } from '../patients/validate';
import { ALLERGIES, CONDITIONS, SYMPTOMS, type Choice } from './lists';

// The whole Intake as one unit. The server runs parseIntake on every submit, and the Intake
// screens import the same function to check each step, so the two cannot drift apart.
export type IntakeInput = {
    personal: {
        fullName: string;
        previousSurname: string | null;
        birthdate: string;
        sex: 'female' | 'male';
        occupation: string;
        mobilePhone: string;
        landline: string | null;
        email: string | null;
        address: string;
        emergencyContactName: string;
        emergencyContactPhone: string;
        patientHistory: string | null;
    };
    // Set only when the Patient is under 18 at submission. `id` points at an existing Guardian
    // (a sibling's), whose details are then updated in place so every child sees one set.
    guardian: { id: string | null; name: string; relationship: string; phone: string } | null;
    medical: {
        seriousIllness: boolean;
        seriousIllnessDetails: string | null;
        bloodTransfusion: boolean;
        transfusionDates: string | null;
        pregnant: boolean | null;
        nursing: boolean | null;
        birthControl: boolean | null;
        conditions: string[];
        medications: string | null;
        allergies: string[];
        allergiesOther: string | null;
    };
    dental: {
        visitReason: string;
        formerDentistName: string | null;
        formerDentistContact: string | null;
        formerDentistAddress: string | null;
        lastDentalCare: string | null;
        symptoms: string[];
        brushFrequency: string;
        flossFrequency: string;
    };
    consent: true;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function isCalendarDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

class Reader {
    constructor(
        private src: Record<string, unknown>,
        private prefix: string,
        private errors: FieldErrors,
    ) {}

    private key = (name: string) => `${this.prefix}${name}`;

    required(name: string, message: string, max = 200) {
        const value = text(this.src[name]);
        if (!value) this.errors[this.key(name)] = message;
        else if (value.length > max) this.errors[this.key(name)] = `Use ${max} characters or fewer.`;
        return value;
    }

    optional(name: string, max = 500) {
        const value = text(this.src[name]);
        if (value.length > max) this.errors[this.key(name)] = `Use ${max} characters or fewer.`;
        return value || null;
    }

    phone(name: string, required = true) {
        const value = text(this.src[name]);
        if (!value) {
            if (required) this.errors[this.key(name)] = 'Enter a phone number.';
            return value || null;
        }
        if (!/^[+\d][\d\s()-]*$/.test(value) || value.replace(/\D/g, '').length < 7 || value.length > 30) {
            this.errors[this.key(name)] = 'Enter a valid phone number.';
        }
        return value;
    }

    yesNo(name: string, message: string) {
        const value = this.src[name];
        if (typeof value !== 'boolean') {
            this.errors[this.key(name)] = message;
            return false;
        }
        return value;
    }

    date(name: string, message: string, today: string, required: boolean) {
        const value = text(this.src[name]);
        if (!value) {
            if (required) this.errors[this.key(name)] = message;
            return value || null;
        }
        if (!isCalendarDate(value) || value > today) this.errors[this.key(name)] = 'Enter a date that is not in the future.';
        return value;
    }

    keys(name: string, list: Choice[]) {
        const value = this.src[name];
        if (value === undefined) return [];
        const known = new Set(list.map((c) => c.key));
        if (!Array.isArray(value) || value.some((k) => typeof k !== 'string' || !known.has(k))) {
            this.errors[this.key(name)] = 'Choose only items from the list.';
            return [];
        }
        // Stored in the paper form's order, so alerts read the same however the boxes were ticked.
        return list.filter((c) => (value as string[]).includes(c.key)).map((c) => c.key);
    }
}

export function parseIntake(body: unknown, today: string): Result<IntakeInput> {
    const b = isObject(body) ? body : {};
    const errors: FieldErrors = {};
    const section = (name: string) => (isObject(b[name]) ? (b[name] as Record<string, unknown>) : {});

    const p = new Reader(section('personal'), 'personal.', errors);
    const personalSrc = section('personal');
    const birthdate = p.date('birthdate', 'Enter the birthdate.', today, true);
    const sexRaw = personalSrc.sex;
    if (sexRaw !== 'female' && sexRaw !== 'male') errors['personal.sex'] = 'Choose female or male.';
    const sex = sexRaw === 'female' ? 'female' : 'male';
    const personal = {
        fullName: p.required('fullName', 'Enter the full name.'),
        previousSurname: p.optional('previousSurname', 100),
        birthdate: birthdate ?? '',
        sex: sex as 'female' | 'male',
        occupation: p.required('occupation', 'Enter the occupation.'),
        mobilePhone: p.phone('mobilePhone') ?? '',
        landline: p.phone('landline', false),
        email: p.optional('email', 200),
        address: p.required('address', 'Enter the address.', 500),
        emergencyContactName: p.required('emergencyContactName', 'Enter the emergency contact.'),
        emergencyContactPhone: p.phone('emergencyContactPhone') ?? '',
        patientHistory: p.optional('patientHistory', 2000),
    };
    if (personal.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email)) {
        errors['personal.email'] = 'Enter a valid email address.';
    }

    const underEighteen = personal.birthdate !== '' && !errors['personal.birthdate'] && ageOn(personal.birthdate, today) < 18;
    let guardian: IntakeInput['guardian'] = null;
    if (underEighteen) {
        const gSrc = isObject(b.guardian) ? b.guardian : null;
        if (!gSrc) {
            errors.guardian = 'A Guardian is required for a Patient under 18.';
        } else {
            const g = new Reader(gSrc, 'guardian.', errors);
            guardian = {
                id: typeof gSrc.id === 'string' && gSrc.id ? gSrc.id : null,
                name: g.required('name', "Enter the Guardian's name."),
                relationship: g.required('relationship', 'Enter how the Guardian is related.', 100),
                phone: g.phone('phone') ?? '',
            };
        }
    }

    const mSrc = section('medical');
    const m = new Reader(mSrc, 'medical.', errors);
    const seriousIllness = m.yesNo('seriousIllness', 'Answer yes or no.');
    const seriousIllnessDetails = m.optional('seriousIllnessDetails', 1000);
    if (seriousIllness && !seriousIllnessDetails && !errors['medical.seriousIllnessDetails']) {
        errors['medical.seriousIllnessDetails'] = 'Describe the illness or operation.';
    }
    const bloodTransfusion = m.yesNo('bloodTransfusion', 'Answer yes or no.');
    const transfusionDates = m.optional('transfusionDates', 200);

    // Female-only questions: required for female, rejected otherwise.
    const femaleOnly = ['pregnant', 'nursing', 'birthControl'] as const;
    const answers: Record<(typeof femaleOnly)[number], boolean | null> = { pregnant: null, nursing: null, birthControl: null };
    for (const name of femaleOnly) {
        if (sex === 'female') {
            if (typeof mSrc[name] === 'boolean') answers[name] = mSrc[name] as boolean;
            else errors[`medical.${name}`] = 'Answer yes or no.';
        } else if (mSrc[name] !== undefined && mSrc[name] !== null) {
            errors[`medical.${name}`] = 'This question is only for female Patients.';
        }
    }

    const medical = {
        seriousIllness,
        seriousIllnessDetails: seriousIllness ? seriousIllnessDetails : null,
        bloodTransfusion,
        transfusionDates: bloodTransfusion ? transfusionDates : null,
        ...answers,
        conditions: m.keys('conditions', CONDITIONS),
        medications: m.optional('medications', 1000),
        allergies: m.keys('allergies', ALLERGIES),
        allergiesOther: m.optional('allergiesOther', 500),
    };

    const d = new Reader(section('dental'), 'dental.', errors);
    const dental = {
        visitReason: d.required('visitReason', "Enter the reason for today's visit.", 500),
        formerDentistName: d.optional('formerDentistName', 200),
        formerDentistContact: d.optional('formerDentistContact', 100),
        formerDentistAddress: d.optional('formerDentistAddress', 500),
        lastDentalCare: d.date('lastDentalCare', '', today, false),
        symptoms: d.keys('symptoms', SYMPTOMS),
        brushFrequency: d.required('brushFrequency', 'Enter how often you brush.', 100),
        flossFrequency: d.required('flossFrequency', 'Enter how often you floss.', 100),
    };

    if (b.consent !== true) errors.consent = 'Tick the box to give consent.';

    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return { ok: true, value: { personal, guardian, medical, dental, consent: true } };
}

export const isUnderEighteen = (birthdate: string, today: string) => ageOn(birthdate, today) < 18;
