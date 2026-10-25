import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Info, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/Field';
import { api } from '@/lib/api';
import { saveResult, type FieldErrors } from '@/lib/queries';

type Created = { patient: { id: string }; appointmentId: string | null };

// Quick add, for a phone call (docs/design-brief.md section 5): name and phone, and optionally
// the first Appointment in the same request. The new Patient is Pending Intake.
// `?name=` prefills the name, for "No patient matches" on the Patients screen.
export function AddPatient() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [params] = useSearchParams();
    const [fullName, setFullName] = useState(params.get('name') ?? '');
    const [mobilePhone, setMobilePhone] = useState('');
    const [withAppointment, setWithAppointment] = useState(false);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [reason, setReason] = useState('');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saved, setSaved] = useState<Created | null>(null);

    const save = useMutation({
        // TanStack Query's useMutation wraps a write: it tracks pending/error state for us.
        // Under it is one request: POST /api/patients with this JSON body.
        mutationFn: async () => {
            const res = await api.api.patients.$post({
                json: {
                    fullName,
                    mobilePhone,
                    appointment: withAppointment ? { date, time, reason: reason.trim() || null } : null,
                },
            });
            return saveResult<Created>(res);
        },
        onSuccess: async (result) => {
            if (!result.ok) return setErrors(result.errors);
            setErrors({});
            await queryClient.invalidateQueries({ queryKey: ['patients'] });
            setSaved(result.data);
        },
    });

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (!save.isPending) save.mutate();
    }

    if (saved) {
        return (
            <div className="mx-auto flex max-w-[480px] flex-col gap-4" role="status">
                <h1 className="text-[24px] font-bold leading-[30px] tracking-tight">Patient saved</h1>
                <p className="text-muted-foreground">
                    {fullName.trim()} is saved as Pending Intake{saved.appointmentId ? ', with their appointment' : ''}.
                </p>
                <Button asChild className="h-12">
                    <Link to={`/patients/${saved.patient.id}`}>Go to Patient Record</Link>
                </Button>
                {saved.appointmentId && (
                    <Button asChild variant="secondary" className="h-12">
                        <Link to={`/appointments/${saved.appointmentId}`}>Go to appointment</Link>
                    </Button>
                )}
            </div>
        );
    }

    return (
        <form onSubmit={onSubmit} noValidate className="mx-auto flex max-w-[480px] flex-col gap-4">
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    aria-label="Close"
                    onClick={() => navigate(-1)}
                    className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-accent"
                >
                    <X className="size-[22px]" aria-hidden />
                </button>
                <h1 className="text-[20px] font-bold leading-7 tracking-tight">Add patient</h1>
            </div>

            <Field
                id="fullName"
                label="Full name"
                type="text"
                autoComplete="off"
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                error={errors.fullName}
            />
            <Field
                id="mobilePhone"
                label="Phone"
                type="tel"
                inputMode="tel"
                placeholder="0917 123 4567"
                value={mobilePhone}
                onChange={(e) => setMobilePhone(e.target.value)}
                error={errors.mobilePhone}
            />

            <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg bg-card px-4 py-3 shadow-sm">
                <input
                    type="checkbox"
                    checked={withAppointment}
                    onChange={(e) => setWithAppointment(e.target.checked)}
                    className="size-6 shrink-0 accent-signal"
                />
                <span className="flex flex-col">
                    <span className="font-bold">Create an appointment now</span>
                    <span className="text-sm text-muted-foreground">Date, time and reason</span>
                </span>
            </label>

            {withAppointment && (
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Field
                            id="date"
                            label="Date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            error={errors['appointment.date']}
                        />
                        <Field
                            id="time"
                            label="Time"
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            error={errors['appointment.time']}
                        />
                    </div>
                    <Field
                        id="reason"
                        label="Reason (optional)"
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        error={errors['appointment.reason']}
                    />
                </div>
            )}

            <p className="flex gap-2 text-sm text-muted-foreground">
                <Info className="mt-px size-[18px] shrink-0" aria-hidden />
                The patient is saved as Pending Intake. The Intake is done at the clinic.
            </p>

            {save.isError && (
                <p role="alert" className="rounded-md bg-[var(--danger-soft)] p-3 text-destructive">
                    Couldn't save. Check your connection and try again.
                </p>
            )}

            <Button type="submit" disabled={save.isPending} className="h-12 text-base font-bold">
                {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {save.isPending ? 'Saving…' : 'Save patient'}
            </Button>
        </form>
    );
}
