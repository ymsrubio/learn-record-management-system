import { clinicInstant } from '../clock';
import { isCalendarDate, type FieldErrors, type Result } from '../patients/validate';
import { DEFAULT_DURATION_MINUTES, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES, STATUSES, type Status } from './rules';

// The validator hands back the same shape the client sent (date and time as text), so the RPC
// client's request type matches. `startOf` turns it into the UTC instant.
export type ScheduleInput = { date: string; time: string; durationMinutes: number; reason: string | null };
export type CreateInput = ScheduleInput & { patientId: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function schedule(b: Record<string, unknown>, errors: FieldErrors): ScheduleInput {
    const date = str(b.date);
    const time = str(b.time);
    if (!isCalendarDate(date)) errors.date = 'Choose a date.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = 'Choose a time.';

    const durationMinutes = b.durationMinutes === undefined ? DEFAULT_DURATION_MINUTES : b.durationMinutes;
    if (
        typeof durationMinutes !== 'number' ||
        !Number.isInteger(durationMinutes) ||
        durationMinutes < MIN_DURATION_MINUTES ||
        durationMinutes > MAX_DURATION_MINUTES
    ) {
        errors.durationMinutes = `Enter a whole number of minutes from ${MIN_DURATION_MINUTES} to ${MAX_DURATION_MINUTES}.`;
    }

    const reason = str(b.reason);
    if (reason.length > 500) errors.reason = 'Use 500 characters or fewer.';

    return { date, time, durationMinutes: durationMinutes as number, reason: reason || null };
}

export const startOf = (a: ScheduleInput) => clinicInstant(a.date, a.time);

export function parseCreate(body: unknown): Result<CreateInput> {
    const b = isObject(body) ? body : {};
    const errors: FieldErrors = {};
    const patientId = str(b.patientId);
    if (!patientId) errors.patientId = 'Choose a patient.';
    const value = schedule(b, errors);
    return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { ...value, patientId } };
}

export function parseEdit(body: unknown): Result<ScheduleInput> {
    const errors: FieldErrors = {};
    const value = schedule(isObject(body) ? body : {}, errors);
    return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

export function parseWalkIn(body: unknown): Result<{ patientId: string }> {
    const patientId = str(isObject(body) ? body.patientId : '');
    return patientId ? { ok: true, value: { patientId } } : { ok: false, errors: { patientId: 'Choose a patient.' } };
}

export function parseStatus(body: unknown): Result<{ status: Status }> {
    const status = isObject(body) ? body.status : undefined;
    return STATUSES.includes(status as Status)
        ? { ok: true, value: { status: status as Status } }
        : { ok: false, errors: { status: 'Choose a status.' } };
}
