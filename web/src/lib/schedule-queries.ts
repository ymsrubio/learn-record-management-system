import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

// The Appointments whose clinic date is in [from, to]. Saving an Appointment invalidates the
// ['appointments'] prefix, so the Schedule refreshes by itself.
export const appointmentsRangeQuery = (from: string, to: string) =>
    queryOptions({
        queryKey: ['appointments', 'range', from, to],
        queryFn: async () => {
            const res = await api.api.appointments.$get({ query: { from, to } });
            if (!res.ok) throw new Error(`GET /api/appointments failed with ${res.status}`);
            return res.json();
        },
    });

// Working Hours never change while the app is open, so fetch them once.
export const workingHoursQuery = queryOptions({
    queryKey: ['schedule', 'working-hours'],
    staleTime: Infinity,
    queryFn: async () => {
        const res = await api.api.schedule['working-hours'].$get();
        if (!res.ok) throw new Error(`GET /api/schedule/working-hours failed with ${res.status}`);
        return (await res.json()).days;
    },
});
