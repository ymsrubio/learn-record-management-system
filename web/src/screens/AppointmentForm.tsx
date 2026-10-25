import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Ban, CalendarCheck, CheckCircle2, Footprints, Loader2, RotateCcw, UserX, X } from 'lucide-react';
import { AppointmentWarnings, type Warnings } from '@/components/AppointmentWarnings';
import { Field } from '@/components/Field';
import { PatientPicker, type PickedPatient } from '@/components/PatientPicker';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { appointmentQuery, saveResult, type FieldErrors } from '@/lib/queries';

type Saved = {
    appointment: { id: string; patientId: string; patientName: string; date: string; time: string };
    warnings: Warnings;
};

const DURATIONS = [15, 30, 45, 60, 90, 120];
const clinicToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

// /appointments/new creates one (?patientId=, ?date=, ?time= prefill it; ?walkin=1 is the Walk-in
// shortcut). /appointments/:id edits one and carries the status actions.
// docs/design-brief.md section 7, canvas appointment-phone-create / -edit / -walkin.
export function AppointmentForm() {
    const { id } = useParams();
    return id ? <EditAppointment id={id} /> : <CreateAppointment />;
}

function Header({ title }: { title: string }) {
    const navigate = useNavigate();
    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                aria-label="Close"
                onClick={() => navigate(-1)}
                className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-accent"
            >
                <X className="size-[22px]" aria-hidden />
            </button>
            <h1 className="text-[20px] font-bold leading-7 tracking-tight">{title}</h1>
        </div>
    );
}

function SaveBar({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
    return (
        <Button type="submit" disabled={pending} className="h-12 text-base font-bold">
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? pendingLabel : label}
        </Button>
    );
}

function SaveFailed() {
    return (
        <p role="alert" className="rounded-md bg-[var(--danger-soft)] p-3 text-destructive">
            Couldn't save. Check your connection and try again.
        </p>
    );
}

function CreateAppointment() {
    const queryClient = useQueryClient();
    const [params] = useSearchParams();
    const walkIn = params.get('walkin') === '1';
    const presetId = params.get('patientId');

    const [patient, setPatient] = useState<PickedPatient | null>(null);
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [date, setDate] = useState(params.get('date') ?? clinicToday());
    const [time, setTime] = useState(params.get('time') ?? '');
    const [duration, setDuration] = useState(30);
    const [reason, setReason] = useState('');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saved, setSaved] = useState<Saved | null>(null);

    // ?patientId= arrives from the Patient Record's Create appointment action.
    const preset = useQuery({
        queryKey: ['patients', presetId],
        enabled: presetId !== null && patient === null,
        queryFn: async () => {
            const res = await api.api.patients[':id'].$get({ param: { id: presetId! } });
            return res.ok ? (await res.json()).patient : null;
        },
    });
    const picked = patient ?? (presetId && preset.data ? { id: preset.data.id, fullName: preset.data.fullName } : null);

    const save = useMutation({
        mutationFn: async (): Promise<{ ok: true; data: Saved } | { ok: false; errors: FieldErrors }> => {
            let patientId = picked?.id;
            if (adding) {
                const created = await saveResult<{ patient: { id: string } }>(
                    await api.api.patients.$post({ json: { fullName: newName, mobilePhone: newPhone, appointment: null } }),
                );
                if (!created.ok) return created;
                patientId = created.data.patient.id;
            }
            if (!patientId) return { ok: false, errors: { patientId: 'Choose a patient.' } };

            const res = walkIn
                ? await api.api.appointments['walk-in'].$post({ json: { patientId } })
                : await api.api.appointments.$post({ json: { patientId, date, time, durationMinutes: duration, reason } });
            if (res.status === 409) throw new Error('archived');
            return saveResult<Saved>(res);
        },
        onSuccess: async (result) => {
            if (!result.ok) return setErrors(result.errors);
            setErrors({});
            await queryClient.invalidateQueries({ queryKey: ['patients'] });
            await queryClient.invalidateQueries({ queryKey: ['appointments'] });
            setSaved(result.data);
        },
    });

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (!save.isPending) save.mutate();
    }

    if (saved) {
        return (
            <div className="mx-auto flex max-w-[480px] flex-col gap-4">
                <h1 className="text-[24px] font-bold leading-[30px] tracking-tight" role="status">
                    {walkIn ? 'Walk-in started' : 'Appointment saved'}
                </h1>
                <p className="text-muted-foreground">
                    {saved.appointment.patientName} · {saved.appointment.date} at {saved.appointment.time}
                </p>
                <AppointmentWarnings warnings={saved.warnings} />
                <Button asChild className="h-12">
                    <Link to={`/patients/${saved.appointment.patientId}`}>Go to Patient Record</Link>
                </Button>
                <Button asChild variant="secondary" className="h-12">
                    <Link to={`/appointments/${saved.appointment.id}`}>Edit appointment</Link>
                </Button>
            </div>
        );
    }

    return (
        <form onSubmit={onSubmit} noValidate className="mx-auto flex max-w-[480px] flex-col gap-4">
            <Header title={walkIn ? 'Walk-in' : 'Create appointment'} />

            {adding ? (
                <div className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-sm">
                    <h2 className="font-bold">New patient</h2>
                    <Field id="new-name" label="Full name" autoComplete="off" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} error={errors.fullName} />
                    <Field id="new-phone" label="Phone" type="tel" inputMode="tel" placeholder="0917 123 4567" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} error={errors.mobilePhone} />
                    <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                        Pick an existing patient instead
                    </Button>
                </div>
            ) : (
                <PatientPicker value={picked} onChange={setPatient} onAddNew={() => setAdding(true)} error={errors.patientId} />
            )}

            {walkIn ? (
                <p className="flex gap-2 text-sm text-muted-foreground">
                    <Footprints className="mt-px size-[18px] shrink-0" aria-hidden />
                    Creates an appointment for right now, for 30 minutes.
                </p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <Field id="date" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
                        <Field id="time" label="Start time" type="time" value={time} onChange={(e) => setTime(e.target.value)} error={errors.time} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="duration" className="text-sm font-semibold leading-5">
                            Duration
                        </label>
                        <select
                            id="duration"
                            value={duration}
                            onChange={(e) => setDuration(Number(e.target.value))}
                            className="h-12 w-full rounded-md border border-input bg-card px-3 text-base"
                        >
                            {DURATIONS.map((m) => (
                                <option key={m} value={m}>
                                    {m} minutes
                                </option>
                            ))}
                        </select>
                    </div>
                    <Field id="reason" label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
                </>
            )}

            {save.isError && <SaveFailed />}
            <SaveBar pending={save.isPending} label={walkIn ? 'Start walk-in now' : 'Save appointment'} pendingLabel="Saving…" />
        </form>
    );
}

const statusActions = [
    { status: 'completed', label: 'Complete', icon: CheckCircle2 },
    { status: 'cancelled', label: 'Cancel', icon: Ban },
    { status: 'no_show', label: 'Mark no-show', icon: UserX },
] as const;

function EditAppointment({ id }: { id: string }) {
    const queryClient = useQueryClient();
    const { data, isPending, error, refetch } = useQuery(appointmentQuery(id));

    if (isPending) return <p className="text-muted-foreground">Loading appointment…</p>;
    if (error) {
        return (
            <div className="rounded-lg bg-[var(--danger-soft)] p-4 text-destructive">
                <p className="font-semibold">Couldn't load this appointment.</p>
                <Button variant="secondary" className="mt-3" onClick={() => refetch()}>
                    Try again
                </Button>
            </div>
        );
    }
    if (data === null) {
        return (
            <div>
                <h1 className="text-2xl font-bold">Appointment not found</h1>
                <Link to="/schedule" className="mt-2 inline-block font-bold text-signal">
                    Back to Schedule
                </Link>
            </div>
        );
    }

    const apply = async (next: typeof data) => {
        queryClient.setQueryData(appointmentQuery(id).queryKey, next);
        await queryClient.invalidateQueries({ queryKey: ['patients'] });
    };

    return <EditForm key={data.appointment.id} data={data} onSaved={apply} />;
}

type Loaded = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof appointmentQuery>['queryFn']>>>>;

const statusLabel = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' } as const;

function EditForm({ data, onSaved }: { data: Loaded; onSaved: (next: Loaded) => Promise<void> }) {
    const { appointment, warnings } = data;
    const [date, setDate] = useState(appointment.date);
    const [time, setTime] = useState(appointment.time);
    const [duration, setDuration] = useState(appointment.durationMinutes);
    const [reason, setReason] = useState(appointment.reason ?? '');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [notice, setNotice] = useState('');

    const save = useMutation({
        mutationFn: async () =>
            saveResult<Loaded>(
                await api.api.appointments[':id'].$patch({
                    param: { id: appointment.id },
                    json: { date, time, durationMinutes: duration, reason },
                }),
            ),
        onSuccess: async (result) => {
            if (!result.ok) return setErrors(result.errors);
            setErrors({});
            setNotice('Appointment saved.');
            await onSaved(result.data);
        },
    });

    const changeStatus = useMutation({
        mutationFn: async (status: 'scheduled' | 'completed' | 'cancelled' | 'no_show') => {
            const res = await api.api.appointments[':id'].status.$post({ param: { id: appointment.id }, json: { status } });
            if (res.status === 409) throw new Error((await res.json() as { error: string }).error);
            return saveResult<Loaded>(res);
        },
        onSuccess: async (result) => {
            if (!result.ok) return;
            setNotice('');
            await onSaved(result.data);
        },
    });

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (!save.isPending) save.mutate();
    }

    const busy = save.isPending || changeStatus.isPending;
    const offered = appointment.status === 'scheduled' ? statusActions : [];

    return (
        <form onSubmit={onSubmit} noValidate className="mx-auto flex max-w-[480px] flex-col gap-4">
            <Header title="Edit appointment" />

            <section className="flex flex-col gap-1 rounded-lg bg-card px-4 py-3 shadow-sm" aria-label="Appointment">
                <Link to={`/patients/${appointment.patientId}`} className="font-bold text-signal">
                    {appointment.patientName}
                </Link>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarCheck className="size-4" aria-hidden />
                    <span>Status: {statusLabel[appointment.status]}</span>
                    {appointment.walkIn && <span>· Walk-in</span>}
                </p>
            </section>

            <AppointmentWarnings warnings={warnings} />

            <div className="grid grid-cols-2 gap-3">
                <Field id="date" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
                <Field id="time" label="Start time" type="time" value={time} onChange={(e) => setTime(e.target.value)} error={errors.time} />
            </div>
            <div className="flex flex-col gap-2">
                <label htmlFor="duration" className="text-sm font-semibold leading-5">
                    Duration
                </label>
                <select
                    id="duration"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="h-12 w-full rounded-md border border-input bg-card px-3 text-base"
                >
                    {[...new Set([...DURATIONS, appointment.durationMinutes])].sort((a, b) => a - b).map((m) => (
                        <option key={m} value={m}>
                            {m} minutes
                        </option>
                    ))}
                </select>
                {errors.durationMinutes && <p className="text-sm text-destructive">{errors.durationMinutes}</p>}
            </div>
            <Field id="reason" label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />

            {notice && (
                <p role="status" className="text-sm font-semibold text-muted-foreground">
                    {notice}
                </p>
            )}
            {(save.isError || changeStatus.isError) && (
                <p role="alert" className="rounded-md bg-[var(--danger-soft)] p-3 text-destructive">
                    {changeStatus.error?.message || "Couldn't save. Check your connection and try again."}
                </p>
            )}

            <SaveBar pending={save.isPending} label="Save changes" pendingLabel="Saving…" />

            <section aria-label="Status" className="flex flex-col gap-2">
                <h2 className="font-bold">Status</h2>
                {offered.map(({ status, label, icon: Icon }) => (
                    <Button key={status} type="button" variant="secondary" className="h-12" disabled={busy} onClick={() => changeStatus.mutate(status)}>
                        <Icon aria-hidden />
                        {label}
                    </Button>
                ))}
                {appointment.status !== 'scheduled' && (
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-12"
                        disabled={busy || appointment.statusLocked}
                        onClick={() => changeStatus.mutate('scheduled')}
                    >
                        <RotateCcw aria-hidden />
                        Back to Scheduled
                    </Button>
                )}
            </section>
        </form>
    );
}
