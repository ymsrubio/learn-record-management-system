import { ageOn, clinicDate } from '../../../../worker/clock';
import { isUnderEighteen, parseIntake } from '../../../../worker/intake/validate';

// The Intake screens keep every answer in one object. Text boxes hold strings; yes/no questions
// hold true, false, or null until answered.
export type Form = {
    personal: {
        fullName: string;
        previousSurname: string;
        birthdate: string;
        sex: '' | 'female' | 'male';
        occupation: string;
        mobilePhone: string;
        landline: string;
        email: string;
        address: string;
        emergencyContactName: string;
        emergencyContactPhone: string;
        patientHistory: string;
    };
    guardian: { id: string | null; name: string; relationship: string; phone: string };
    medical: {
        seriousIllness: boolean | null;
        seriousIllnessDetails: string;
        bloodTransfusion: boolean | null;
        transfusionDates: string;
        pregnant: boolean | null;
        nursing: boolean | null;
        birthControl: boolean | null;
        conditions: string[];
        medications: string;
        allergies: string[];
        allergiesOther: string;
    };
    dental: {
        visitReason: string;
        formerDentistName: string;
        formerDentistContact: string;
        formerDentistAddress: string;
        lastDentalCare: string;
        symptoms: string[];
        brushFrequency: string;
        flossFrequency: string;
    };
    consent: boolean;
};

export const emptyForm: Form = {
    personal: {
        fullName: '', previousSurname: '', birthdate: '', sex: '', occupation: '', mobilePhone: '', landline: '',
        email: '', address: '', emergencyContactName: '', emergencyContactPhone: '', patientHistory: '',
    },
    guardian: { id: null, name: '', relationship: '', phone: '' },
    medical: {
        seriousIllness: null, seriousIllnessDetails: '', bloodTransfusion: null, transfusionDates: '',
        pregnant: null, nursing: null, birthControl: null, conditions: [], medications: '', allergies: [], allergiesOther: '',
    },
    dental: {
        visitReason: '', formerDentistName: '', formerDentistContact: '', formerDentistAddress: '',
        lastDentalCare: '', symptoms: [], brushFrequency: '', flossFrequency: '',
    },
    consent: false,
};

export const clinicToday = () => clinicDate(new Date());

// Under 18 on the clinic's date, from the birthdate typed so far. False until a valid date is entered.
export function isMinor(form: Form): boolean {
    const b = form.personal.birthdate;
    return /^\d{4}-\d{2}-\d{2}$/.test(b) && b <= clinicToday() && isUnderEighteen(b, clinicToday());
}

export const ageOf = (birthdate: string) => ageOn(birthdate, clinicToday());

// The request body. The Guardian goes only with a Patient under 18, and the female-only answers
// only with sex female, which is what the server expects.
export function toBody(form: Form) {
    const female = form.personal.sex === 'female';
    const { pregnant, nursing, birthControl, ...medical } = form.medical;
    return {
        personal: form.personal,
        guardian: isMinor(form) ? form.guardian : undefined,
        medical: { ...medical, ...(female ? { pregnant, nursing, birthControl } : {}) },
        dental: form.dental,
        consent: form.consent,
    };
}

export type StepId = 'personal' | 'guardian' | 'medical' | 'conditions' | 'dental' | 'consent' | 'review';

export const stepsFor = (form: Form): StepId[] => [
    'personal',
    ...(isMinor(form) ? (['guardian'] as const) : []),
    'medical',
    'conditions',
    'dental',
    'consent',
    'review',
];

export const stepTitle: Record<StepId, string> = {
    personal: 'Personal details',
    guardian: 'Guardian',
    medical: 'Medical History',
    conditions: 'Conditions',
    dental: 'Dental History',
    consent: 'Consent',
    review: 'Review',
};

// Which error keys belong on which screen.
const owns: Record<StepId, (key: string) => boolean> = {
    personal: (k) => k.startsWith('personal.'),
    guardian: (k) => k.startsWith('guardian'),
    medical: (k) => k.startsWith('medical.') && k !== 'medical.conditions',
    conditions: (k) => k === 'medical.conditions',
    dental: (k) => k.startsWith('dental.'),
    consent: (k) => k === 'consent',
    review: () => false,
};

// The same parseIntake the server runs, run on the whole form. A screen shows only its own errors.
export function allErrors(form: Form): Record<string, string> {
    const parsed = parseIntake(toBody(form), clinicToday());
    return parsed.ok ? {} : parsed.errors;
}

export function errorsFor(step: StepId, errors: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(errors).filter(([k]) => owns[step](k)));
}

export const stepOfError = (key: string, steps: StepId[]): StepId | undefined => steps.find((s) => owns[s](key));

