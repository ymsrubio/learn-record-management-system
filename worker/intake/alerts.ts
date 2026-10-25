import { ALLERGIES, CONDITIONS, labelOf } from './lists';

type HistoryForAlerts = {
    allergies: string[];
    allergiesOther: string | null;
    conditions: string[];
    pregnant: boolean | null;
    nursing: boolean | null;
    medications: string | null;
};

// The risk-first strip under the Patient Record header. Allergies come first, then ticked
// conditions, pregnant/nursing and the medications text.
export function medicalAlerts(h: HistoryForAlerts): string[] {
    return [
        ...h.allergies.map((k) => `Allergy: ${labelOf(ALLERGIES, k)}`),
        ...(h.allergiesOther ? [`Allergy: ${h.allergiesOther}`] : []),
        ...h.conditions.map((k) => labelOf(CONDITIONS, k)),
        ...(h.pregnant ? ['Pregnant'] : []),
        ...(h.nursing ? ['Nursing'] : []),
        ...(h.medications ? [`Medications: ${h.medications}`] : []),
    ];
}
