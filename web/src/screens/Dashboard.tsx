import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { Link } from 'react-router';
import { Ban, CheckCircle2, Hourglass, Plus, UserPlus, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { dashboardQuery } from '@/lib/queries';
import { dayName, dayNumber, formatMinutes, minutesOf } from '@/lib/schedule';
import { cn } from '@/lib/utils';

type Summary = InferResponseType<typeof api.api.dashboard.$get>;
type Item = Summary['todaysAppointments'][number];
type Status = Item['status'];

const STATUS_LABEL: Record<Status, string> = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' };
const ACTIONS = [
    { status: 'completed', label: 'Complete', icon: CheckCircle2 },
    { status: 'cancelled', label: 'Cancel', icon: Ban },
    { status: 'no_show', label: 'No-show', icon: UserX },
] as const;

// docs/design-brief.md section 2. One request feeds four sections; the empty ones are hidden.
export function Dashboard() {
    const summary = useQuery(dashboardQuery);
    const data = summary.data;

    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-[28px] font-bold leading-[34px] tracking-tight">Dashboard</h1>
            <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary" className="h-12 flex-1 md:flex-none">
                    <Link to="/patients/new">
                        <UserPlus aria-hidden />
                        Add patient
                    </Link>
                </Button>
                <Button asChild className="h-12 flex-1 md:flex-none">
                    <Link to="/appointments/new">
                        <Plus aria-hidden />
                        Create appointment
                    </Link>
                </Button>
            </div>

            {summary.isError && <p role="alert">Couldn't load the Dashboard. Check your connection and try again.</p>}
            {!data && !summary.isError && <p role="status" className="text-muted-foreground">Loading…</p>}
            {data && (data.clinicIsEmpty ? <NewClinic /> : <Sections data={data} />)}
        </div>
    );
}

function NewClinic() {
    return (
        <section className="flex flex-col items-center gap-3 rounded-lg bg-card p-6 text-center shadow-sm">
            <h2 className="text-lg font-bold">Welcome. Nothing is here yet.</h2>
            <p className="text-muted-foreground">Add your first patient to start building the clinic's records, then book their appointment.</p>
            <Button asChild className="h-12 w-full max-w-[320px]">
                <Link to="/patients/new">
                    <UserPlus aria-hidden />
                    Add patient
                </Link>
            </Button>
        </section>
    );
}

function Sections({ data }: { data: Summary }) {
    const today = data.todaysAppointments;
    return (
        <>
            <section aria-labelledby="today-h" className="flex flex-col gap-3">
                <h2 id="today-h" className="text-lg font-bold">
                    Today's appointments
                </h2>
                {today.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg bg-card p-6 text-center shadow-sm">
                        <p className="font-semibold">No appointments today</p>
                        <Button asChild className="h-12 w-full max-w-[320px]">
                            <Link to="/appointments/new">
                                <Plus aria-hidden />
                                Create appointment
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {today.map((a) => (
                            <AppointmentCard key={a.id} appointment={a} isNext={a.id === data.nextAppointmentId} />
                        ))}
                    </ul>
                )}
            </section>

            {data.needsStatusUpdate.length > 0 && (
                <section aria-labelledby="needs-h" className="flex flex-col gap-3">
                    <h2 id="needs-h" className="text-lg font-bold">
                        Needs a status update
                    </h2>
                    <ul className="flex flex-col gap-2">
                        {data.needsStatusUpdate.map((a) => (
                            <AppointmentCard key={a.id} appointment={a} withDate />
                        ))}
                    </ul>
                </section>
            )}

            {data.pendingIntake.length > 0 && (
                <section aria-labelledby="intake-h" className="flex flex-col gap-3">
                    <h2 id="intake-h" className="text-lg font-bold">
                        Pending Intake
                    </h2>
                    <ul className="flex flex-col gap-2">
                        {data.pendingIntake.map((p) => (
                            <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-card p-4 shadow-sm">
                                <Link to={`/patients/${p.id}`} className="min-w-0">
                                    <span className="flex items-center gap-2 font-bold">
                                        <span className="truncate">{p.fullName}</span>
                                        <Hourglass className="size-4 shrink-0 text-warning" aria-hidden />
                                    </span>
                                    {p.mobilePhone && <span className="block text-sm text-muted-foreground">{p.mobilePhone}</span>}
                                </Link>
                                <Button asChild variant="secondary" className="h-11 shrink-0">
                                    <Link to={`/patients/${p.id}/intake`}>Start Intake</Link>
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section aria-labelledby="week-h" className="flex flex-col gap-3">
                <h2 id="week-h" className="text-lg font-bold">
                    Next 7 days
                </h2>
                <ul className="grid grid-cols-7 gap-1.5">
                    {data.nextDays.map((d, i) => (
                        <li key={d.date}>
                            <Link
                                to={`/schedule?date=${d.date}&view=day`}
                                aria-label={`${dayName(d.date)} ${dayNumber(d.date)}: ${d.count} ${d.count === 1 ? 'appointment' : 'appointments'}`}
                                className={cn(
                                    'flex min-h-[72px] flex-col items-center justify-center gap-0.5 rounded-lg bg-card py-2 shadow-sm',
                                    i === 0 && 'ring-2 ring-primary',
                                )}
                            >
                                <span className="text-xs text-muted-foreground">{dayName(d.date)}</span>
                                <span className="text-sm font-semibold">{dayNumber(d.date)}</span>
                                <span className={cn('text-lg font-bold', d.count === 0 && 'text-muted-foreground')}>{d.count}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>
        </>
    );
}

// Tapping a card opens its status actions in place, so a status change takes two taps.
function AppointmentCard({ appointment: a, isNext = false, withDate = false }: { appointment: Item; isNext?: boolean; withDate?: boolean }) {
    const [open, setOpen] = useState(false);
    const client = useQueryClient();
    const change = useMutation({
        mutationFn: async (status: Status) => {
            const res = await api.api.appointments[':id'].status.$post({ param: { id: a.id }, json: { status } });
            if (!res.ok) throw new Error('status');
        },
        onSuccess: () => {
            setOpen(false);
            return client.invalidateQueries({ queryKey: ['appointments'] });
        },
    });

    const time = formatMinutes(minutesOf(a.time));
    return (
        <li className={cn('rounded-lg bg-card shadow-sm', isNext && 'ring-2 ring-signal')}>
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-3 rounded-lg p-4 text-left">
                <span className="w-20 shrink-0 text-sm font-semibold">
                    {withDate && <span className="block text-muted-foreground">{`${dayName(a.date)} ${dayNumber(a.date)}`}</span>}
                    {time}
                </span>
                <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-bold', a.status === 'cancelled' && 'line-through')}>{a.patientName}</span>
                    {a.reason && <span className="block truncate text-sm text-muted-foreground">{a.reason}</span>}
                </span>
                {isNext && <span className="shrink-0 rounded-full bg-signal px-2 py-0.5 text-xs font-bold text-white">Next</span>}
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">{STATUS_LABEL[a.status]}</span>
            </button>
            {open && (
                <div className="flex flex-col gap-2 px-4 pb-4">
                    {change.isError && (
                        <p role="alert" className="text-sm font-semibold text-destructive">
                            Couldn't update the status. Try again.
                        </p>
                    )}
                    {a.status === 'scheduled' && (
                        <div className="grid grid-cols-3 gap-2">
                            {ACTIONS.map(({ status, label, icon: Icon }) => (
                                <Button key={status} type="button" variant="secondary" className="h-12 px-2" disabled={change.isPending} onClick={() => change.mutate(status)}>
                                    <Icon aria-hidden />
                                    {label}
                                </Button>
                            ))}
                        </div>
                    )}
                    <Button asChild variant="ghost" className="h-11">
                        <Link to={`/appointments/${a.id}`}>Open appointment</Link>
                    </Button>
                </div>
            )}
        </li>
    );
}
