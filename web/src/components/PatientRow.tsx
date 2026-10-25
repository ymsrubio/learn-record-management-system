import { Link } from 'react-router';
import { Hourglass } from 'lucide-react';
import { clinicDateOf, formatDate } from '@/lib/format';

export type PatientHit = {
    id: string;
    fullName: string;
    mobilePhone: string | null;
    birthdate: string | null;
    age: number | null;
    lastAppointmentAt: string | null;
    flags: { pendingIntake: boolean; archived: boolean };
    matchedOn?: 'name' | 'previousSurname' | 'phone' | 'guardianPhone';
};

// Only the reasons that are not obvious from the typed text get a line.
const reason = { previousSurname: 'Matched previous surname', guardianPhone: "Matched Guardian's phone" } as const;

// One Patient in a list (docs/design-brief.md section 3): enough to tell namesakes apart.
export function PatientRow({ patient: p, action }: { patient: PatientHit; action?: React.ReactNode }) {
    const detail = [
        p.age !== null && p.birthdate ? `${p.age} yrs · ${formatDate(p.birthdate)}` : null,
        p.mobilePhone,
    ].filter(Boolean);
    const matched = p.matchedOn === 'previousSurname' || p.matchedOn === 'guardianPhone' ? reason[p.matchedOn] : null;

    return (
        <div className="rounded-lg bg-card shadow-sm">
            <Link to={`/patients/${p.id}`} className="block rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{p.fullName}</p>
                    {p.flags.pendingIntake && (
                        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-warning-soft px-2 text-xs font-semibold text-warning">
                            <Hourglass className="size-3.5" aria-hidden />
                            Pending Intake
                        </span>
                    )}
                    {p.flags.archived && (
                        <span className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
                            Archived
                        </span>
                    )}
                </div>
                {detail.length > 0 && <p className="text-sm text-muted-foreground">{detail.join(' · ')}</p>}
                <p className="text-sm text-muted-foreground">
                    {p.lastAppointmentAt ? `Last appointment ${formatDate(clinicDateOf(p.lastAppointmentAt))}` : 'No appointments yet'}
                </p>
                {matched && <p className="mt-1 text-sm font-semibold text-signal">{matched}</p>}
            </Link>
            {action && <div className="px-4 pb-4">{action}</div>}
        </div>
    );
}
