import { clinicInstant } from '../clock';

// Field name -> message. A route returns this as `{ errors }` with status 400.
export type FieldErrors = Record<string, string>;

export type Result<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export type QuickAppointmentInput = { date: string; time: string; reason: string | null };
export type QuickAddInput = { fullName: string; mobilePhone: string; appointment: QuickAppointmentInput | null };
export type DetailsInput = { fullName: string; mobilePhone: string; birthdate: string | null };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function fullName(body: Record<string, unknown>, errors: FieldErrors) {
    const value = str(body.fullName);
    if (!value) errors.fullName = 'Enter the full name.';
    else if (value.length > 200) errors.fullName = 'Use 200 characters or fewer.';
    return value;
}

function phone(body: Record<string, unknown>, errors: FieldErrors) {
    const value = str(body.mobilePhone);
    if (!value) errors.mobilePhone = 'Enter a phone number.';
    else if (!/^[+\d][\d\s()-]*$/.test(value) || value.replace(/\D/g, '').length < 7 || value.length > 30) {
        errors.mobilePhone = 'Enter a valid phone number.';
    }
    return value;
}

export function isCalendarDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function parseQuickAdd(body: unknown): Result<QuickAddInput> {
    const b = isObject(body) ? body : {};
    const errors: FieldErrors = {};
    const name = fullName(b, errors);
    const mobilePhone = phone(b, errors);

    let appointment: QuickAppointmentInput | null = null;
    if (b.appointment !== undefined && b.appointment !== null) {
        const a = isObject(b.appointment) ? b.appointment : {};
        const date = str(a.date);
        const time = str(a.time);
        if (!isCalendarDate(date)) errors['appointment.date'] = 'Choose a date.';
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors['appointment.time'] = 'Choose a time.';
        const reason = str(a.reason);
        if (reason.length > 500) errors['appointment.reason'] = 'Use 500 characters or fewer.';
        appointment = { date, time, reason: reason || null };
    }

    return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { fullName: name, mobilePhone, appointment } };
}

export function parseDetails(body: unknown, today: string): Result<DetailsInput> {
    const b = isObject(body) ? body : {};
    const errors: FieldErrors = {};
    const name = fullName(b, errors);
    const mobilePhone = phone(b, errors);
    const birthdate = str(b.birthdate);
    if (birthdate && (!isCalendarDate(birthdate) || birthdate > today)) {
        errors.birthdate = 'Enter a birthdate that is not in the future.';
    }
    return Object.keys(errors).length > 0
        ? { ok: false, errors }
        : { ok: true, value: { fullName: name, mobilePhone, birthdate: birthdate || null } };
}

export const appointmentStart = (a: QuickAppointmentInput) => clinicInstant(a.date, a.time);
