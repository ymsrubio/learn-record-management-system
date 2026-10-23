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
