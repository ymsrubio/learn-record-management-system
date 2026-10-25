import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { Ban, Check, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clinicMinutesNow, clinicToday, dayName, dayNumber, formatMinutes, minutesOf, placeInLanes } from '@/lib/schedule';

export type ScheduleAppointment = {
    id: string;
    patientName: string;
    date: string;
    time: string;
    durationMinutes: number;
    reason: string | null;
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
};
export type Period = { open: number; close: number };

const HOUR_PX = 88;
const SLOT_MINUTES = 30;
const STATUS_LABEL = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' } as const;

// The visible hours are the clinic day (8:00 to 17:00) stretched to fit any Appointment outside it.
export function visibleRange(appointments: ScheduleAppointment[], periods: Period[]): { from: number; to: number } {
    const starts = [...periods.map((p) => p.open), ...appointments.map((a) => minutesOf(a.time))];
    const ends = [...periods.map((p) => p.close), ...appointments.map((a) => minutesOf(a.time) + a.durationMinutes)];
    return { from: Math.floor(Math.min(...starts) / 60) * 60, to: Math.ceil(Math.max(...ends) / 60) * 60 };
}

const px = (minutes: number, from: number) => ((minutes - from) / 60) * HOUR_PX;

function StatusMark({ status }: { status: ScheduleAppointment['status'] }) {
    const Icon = status === 'completed' ? Check : status === 'cancelled' ? Ban : status === 'no_show' ? UserX : null;
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 text-xs font-bold',
                status === 'completed' && 'text-success',
                status === 'no_show' && 'text-warning',
                status === 'cancelled' && 'text-muted-foreground',
                status === 'scheduled' && 'text-muted-foreground',
            )}
        >
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {STATUS_LABEL[status]}
        </span>
    );
}

function Block({ appointment, lane, lanes, from, compact }: { appointment: ScheduleAppointment; lane: number; lanes: number; from: number; compact: boolean }) {
    const start = minutesOf(appointment.time);
    const end = start + appointment.durationMinutes;
    const height = Math.max((appointment.durationMinutes / 60) * HOUR_PX, 28);
    const tall = height >= 72 && !compact;
    const label = `${formatMinutes(start)} to ${formatMinutes(end)}, ${appointment.patientName}${appointment.reason ? `, ${appointment.reason}` : ''}, ${STATUS_LABEL[appointment.status]}`;
    return (
        <Link
            to={`/appointments/${appointment.id}`}
            aria-label={label}
            title={label}
            style={{ top: px(start, from), height: height - 2, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
            className={cn(
                'absolute z-10 flex flex-col justify-center overflow-hidden rounded-xl px-2 text-xs leading-4 shadow-sm md:px-3',
                appointment.status === 'scheduled' && 'bg-secondary text-foreground',
                appointment.status === 'completed' && 'border border-border bg-card text-muted-foreground',
                appointment.status === 'no_show' && 'border border-dashed border-input bg-card text-muted-foreground',
                appointment.status === 'cancelled' && 'border border-dashed border-input bg-card text-muted-foreground',
            )}
        >
            <strong className={cn('truncate text-[13px] font-semibold text-foreground', appointment.status === 'cancelled' && 'line-through')}>
                {appointment.patientName}
            </strong>
            {!compact && (
                <span className="truncate">
                    {tall && `${formatMinutes(start)} · `}
                    {appointment.reason ?? ''}
                </span>
            )}
            {(tall || appointment.status !== 'scheduled') && !compact && <StatusMark status={appointment.status} />}
            {compact && appointment.status !== 'scheduled' && <StatusMark status={appointment.status} />}
        </Link>
    );
}

// One column per date, one row per hour. The column is dimmed, the open periods are painted white on
// top, and a button per half hour sits underneath the blocks so an empty slot can be tapped.
export function ScheduleGrid({
    dates,
    appointments,
    hours,
}: {
    dates: string[];
    appointments: ScheduleAppointment[];
    hours: Record<number, Period[]>;
}) {
    const navigate = useNavigate();
    const today = clinicToday();
    const compact = dates.length > 1 && typeof window !== 'undefined' && window.innerWidth < 768;
    const periodsOf = (date: string) => hours[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? [];

    const { from, to } = useMemo(
        () => visibleRange(appointments, dates.flatMap(periodsOf)),
        [appointments, dates, hours],
    );
    const hourMarks = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
    const slots = Array.from({ length: (to - from) / SLOT_MINUTES }, (_, i) => from + i * SLOT_MINUTES);
    const total = ((to - from) / 60) * HOUR_PX;
    const nowMinutes = clinicMinutesNow();

    return (
        <div className="flex">
            <div className="relative w-12 shrink-0 md:w-16" style={{ height: total, marginTop: dates.length > 1 ? 56 : 0 }} aria-hidden>
                {hourMarks.map((m) => (
                    <span key={m} className="absolute left-0 -translate-y-2 text-[13px] leading-4 text-muted-foreground" style={{ top: px(m, from) }}>
                        {formatMinutes(m).replace(':00', '').replace(' ', ' ')}
                    </span>
                ))}
            </div>
            <div className="grid min-w-0 flex-1" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}>
                {dates.map((date) => {
                    const periods = periodsOf(date);
                    const closed = periods.length === 0;
                    const dayAppointments = appointments.filter((a) => a.date === date);
                    const placed = placeInLanes(dayAppointments, (a) => ({ start: minutesOf(a.time), end: minutesOf(a.time) + a.durationMinutes }));
                    return (
                        <section key={date} aria-label={`${dayName(date)} ${dayNumber(date)}`} className="min-w-0 border-l border-border first:border-l-0">
                            {dates.length > 1 && (
                                <div className={cn('flex h-14 flex-col items-center justify-center', date === today && 'text-signal')}>
                                    <span className="text-xs text-muted-foreground">{dayName(date)}</span>
                                    <span
                                        className={cn(
                                            'flex size-8 items-center justify-center rounded-full text-base font-semibold',
                                            date === today && 'bg-primary text-primary-foreground',
                                        )}
                                    >
                                        {dayNumber(date)}
                                    </span>
                                </div>
                            )}
                            <div
                                className="relative overflow-hidden bg-[#e9ebef]"
                                style={{ height: total }}
                                data-closed={closed || undefined}
                            >
                                {periods.map((p) => (
                                    <div
                                        key={p.open}
                                        data-open-hours
                                        className="absolute inset-x-0 bg-card"
                                        style={{ top: px(p.open, from), height: px(p.close, from) - px(p.open, from) }}
                                    />
                                ))}
                                {hourMarks.map((m) => (
                                    <div key={m} className="absolute inset-x-0 h-px bg-border" style={{ top: px(m, from) }} />
                                ))}
                                {closed && dates.length > 1 && (
                                    <span className="absolute inset-x-0 top-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">Closed</span>
                                )}
                                {slots.map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        aria-label={`New appointment ${dayName(date)} ${dayNumber(date)}, ${formatMinutes(m)}`}
                                        onClick={() => navigate(`/appointments/new?date=${date}&time=${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)}
                                        className="absolute inset-x-0 hover:bg-accent/70 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-ring"
                                        style={{ top: px(m, from), height: (SLOT_MINUTES / 60) * HOUR_PX }}
                                    />
                                ))}
                                {placed.map(({ item, lane, lanes }) => (
                                    <Block key={item.id} appointment={item} lane={lane} lanes={lanes} from={from} compact={compact} />
                                ))}
                                {date === today && nowMinutes >= from && nowMinutes <= to && (
                                    <div aria-label="Now" className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: px(nowMinutes, from) - 6 }}>
                                        <span className="size-3 rounded-full border-[3px] border-signal bg-background" />
                                        <span className="h-0.5 flex-1 bg-signal" />
                                    </div>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
