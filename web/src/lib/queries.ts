import { queryOptions } from '@tanstack/react-query';
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
