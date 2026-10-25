import { Clock, TriangleAlert } from 'lucide-react';
import { clinicParts } from '@/lib/format';

export type Warnings = {
    overlaps: { appointmentId: string; patientName: string; startAt: string }[];
    outsideWorkingHours: boolean;
};

// Warnings never block saving (docs/design-brief.md section 7). Each overlap names the other Appointment.
export function AppointmentWarnings({ warnings }: { warnings: Warnings }) {
    if (warnings.overlaps.length === 0 && !warnings.outsideWorkingHours) return null;
    return (
        <div className="flex flex-col gap-2" role="status">
            {warnings.overlaps.map((o) => (
                <p key={o.appointmentId} className="flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 font-bold text-warning">
                    <TriangleAlert className="mt-1 size-[18px] shrink-0" aria-hidden />
                    Overlaps with {clinicParts(o.startAt).time} · {o.patientName}
                </p>
            ))}
            {warnings.outsideWorkingHours && (
                <p className="flex items-start gap-2 rounded-lg bg-accent px-4 py-3 text-foreground">
                    <Clock className="mt-1 size-[18px] shrink-0" aria-hidden />
                    Outside Working Hours. You can still save it.
                </p>
            )}
        </div>
    );
}
