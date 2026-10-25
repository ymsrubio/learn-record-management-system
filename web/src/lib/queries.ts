import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from './api';

// TanStack Query owns fetching state for us: loading, error, caching, refetch on focus.
// Each query is a key (its cache identity) plus a function that returns data or throws.
export const patientsQuery = queryOptions({
    queryKey: ['patients'],
    queryFn: async () => {
        const res = await api.api.patients.$get();
        if (!res.ok) throw new Error(`GET /api/patients failed with ${res.status}`);
        return res.json();
    },
});

// Search as you type: each distinct text is its own cache entry, and keepPreviousData keeps the
// last results on screen while the next keystroke's request is in flight (no flash of "loading").
export const patientSearchQuery = (q: string, includeArchived: boolean) =>
    queryOptions({
        queryKey: ['patients', 'search', q, includeArchived],
        queryFn: async () => {
            const res = await api.api.patients.search.$get({ query: { q, includeArchived: String(includeArchived) } });
            if (!res.ok) throw new Error(`GET /api/patients/search failed with ${res.status}`);
            return (await res.json()).results;
        },
        placeholderData: keepPreviousData,
    });

export const recentPatientsQuery = queryOptions({
    queryKey: ['patients', 'recent'],
    queryFn: async () => {
        const res = await api.api.patients.recent.$get();
        if (!res.ok) throw new Error(`GET /api/patients/recent failed with ${res.status}`);
        return (await res.json()).results;
    },
});

export const duplicatesQuery = (name: string, phone: string) =>
    queryOptions({
        queryKey: ['patients', 'duplicates', name, phone],
        queryFn: async () => {
            const res = await api.api.patients.duplicates.$get({ query: { name, phone } });
            if (!res.ok) throw new Error(`GET /api/patients/duplicates failed with ${res.status}`);
            return (await res.json()).results;
        },
        placeholderData: keepPreviousData,
    });

export const patientRecordQuery = (id: string) =>
    queryOptions({
        queryKey: ['patients', id],
        queryFn: async () => {
            const res = await api.api.patients[':id'].$get({ param: { id } });
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`GET /api/patients/${id} failed with ${res.status}`);
            return res.json();
        },
    });

// The API answers 400 with `{ errors: { field: message } }`. A screen shows each message next to its field.
export type FieldErrors = Record<string, string>;
export type SaveResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

export async function saveResult<T>(res: { ok: boolean; status: number; json(): Promise<unknown> }): Promise<SaveResult<T>> {
    if (res.ok) return { ok: true, data: (await res.json()) as T };
    if (res.status === 400) return { ok: false, errors: ((await res.json()) as { errors: FieldErrors }).errors };
    throw new Error(`Save failed with ${res.status}`);
}

export const appointmentQuery = (id: string) =>
    queryOptions({
        queryKey: ['appointments', id],
        queryFn: async () => {
            const res = await api.api.appointments[':id'].$get({ param: { id } });
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`GET /api/appointments/${id} failed with ${res.status}`);
            return res.json();
        },
    });

export const treatmentNoteQuery = (appointmentId: string) =>
    queryOptions({
        queryKey: ['appointments', appointmentId, 'note'],
        queryFn: async () => {
            const res = await api.api.appointments[':id'].note.$get({ param: { id: appointmentId } });
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`GET /api/appointments/${appointmentId}/note failed with ${res.status}`);
            return res.json();
        },
    });
