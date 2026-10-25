import type { FieldErrors, Result } from '../patients/validate';

export type NoteInput = { findings: string; treatmentDone: string; nextSteps: string | null };
export type AmendmentInput = { text: string };

const MAX_NOTE = 5000;
const MAX_AMENDMENT = 2000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function parseNote(body: unknown): Result<NoteInput> {
    const b = isObject(body) ? body : {};
    const errors: FieldErrors = {};
    const findings = str(b.findings);
    const treatmentDone = str(b.treatmentDone);
    const nextSteps = str(b.nextSteps);
    if (!findings) errors.findings = 'Write what you found.';
    if (!treatmentDone) errors.treatmentDone = 'Write what was done.';
    for (const [key, value] of Object.entries({ findings, treatmentDone, nextSteps })) {
        if (value.length > MAX_NOTE) errors[key] = `Use ${MAX_NOTE} characters or fewer.`;
    }
    return Object.keys(errors).length > 0
        ? { ok: false, errors }
        : { ok: true, value: { findings, treatmentDone, nextSteps: nextSteps || null } };
}

export function parseAmendment(body: unknown): Result<AmendmentInput> {
    const text = str(isObject(body) ? body.text : undefined);
    if (!text) return { ok: false, errors: { text: 'Write the correction.' } };
    if (text.length > MAX_AMENDMENT) return { ok: false, errors: { text: `Use ${MAX_AMENDMENT} characters or fewer.` } };
    return { ok: true, value: { text } };
}
