import { clinicDate } from '../clock';

// A Treatment Note is Locked once the clinic-local date it was written on is before today's.
// Calculated on every read, never stored, so the Clock alone decides.
export function isLocked(writtenAt: Date, today: string): boolean {
    return clinicDate(writtenAt) < today;
}
