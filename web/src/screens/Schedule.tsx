import { useRef, type TouchEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react';
import { ScheduleGrid, type Period } from '@/components/ScheduleGrid';
import { Button } from '@/components/ui/button';
import { appointmentsRangeQuery, workingHoursQuery } from '@/lib/schedule-queries';
import { addDays, clinicToday, dayName, dayNumber, dayTitle, formatMinutes, monthTitle, weekOf, weekdayOf } from '@/lib/schedule';
import { cn } from '@/lib/utils';

type View = 'day' | 'week';

const SWIPE_PX = 50;
const isDate = (v: string | null): v is string => v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isDesktop = () => window.matchMedia('(min-width: 768px)').matches;

// docs/design-brief.md section 8. The URL holds the shown date and view (?date=2026-09-29&view=day),
// so a day can be linked to. With no view in the URL, a phone opens the day and a desktop the week.
export function Schedule() {
    const [params, setParams] = useSearchParams();
    const today = clinicToday();
    const date = isDate(params.get('date')) ? params.get('date')! : today;
    const view: View = params.get('view') === 'day' ? 'day' : params.get('view') === 'week' ? 'week' : isDesktop() ? 'week' : 'day';

    const go = (next: { date?: string; view?: View }) => setParams({ date: next.date ?? date, view: next.view ?? view }, { replace: true });

    const week = weekOf(date);
    const shown = view === 'week' ? week : [date];
    const appointments = useQuery(appointmentsRangeQuery(week[0], week[6]));
    const workingHours = useQuery(workingHoursQuery);

    const hours: Record<number, Period[]> = {};
    for (const d of workingHours.data ?? []) hours[d.weekday] = d.periods;

    const touch = useRef<{ x: number; y: number } | null>(null);
    const onTouchStart = (e: TouchEvent) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = (e: TouchEvent) => {
        const start = touch.current;
        touch.current = null;
        if (!start || view !== 'day') return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go({ date: addDays(date, dx < 0 ? 1 : -1) });
    };

    const count = (d: string) => (appointments.data ?? []).filter((a) => a.date === d).length;
    const dayCount = count(date);
    const step = 7;
    const ready = appointments.data && workingHours.data;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-[28px] font-bold leading-[34px] tracking-tight">Schedule</h1>
                <div role="group" aria-label="View" className="flex gap-0.5 rounded-full bg-secondary p-[3px]">
                    {(['day', 'week'] as const).map((v) => (
                        <button
                            key={v}
                            type="button"
                            aria-pressed={view === v}
                            onClick={() => go({ view: v })}
                            className={cn(
                                'h-[38px] rounded-full px-4 text-sm',
                                view === v ? 'bg-primary font-bold text-primary-foreground' : 'font-medium text-secondary-foreground',
                            )}
                        >
                            {v === 'day' ? 'Day' : 'Week'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-between">
                <button type="button" aria-label="Previous week" onClick={() => go({ date: addDays(date, -step) })} className="flex size-11 items-center justify-center rounded-full hover:bg-accent">
                    <ChevronLeft className="size-5" aria-hidden />
                </button>
                <div className="flex items-center gap-3">
                    <span className="text-base font-semibold">{monthTitle(week)}</span>
                    <Button type="button" variant="secondary" className="h-9 px-4" onClick={() => go({ date: today })}>
                        Today
                    </Button>
                </div>
                <button type="button" aria-label="Next week" onClick={() => go({ date: addDays(date, step) })} className="flex size-11 items-center justify-center rounded-full hover:bg-accent">
                    <ChevronRight className="size-5" aria-hidden />
                </button>
            </div>

            {view === 'day' && (
                <div className="grid grid-cols-7 gap-0.5 text-center">
                    {week.map((d) => {
                        const n = count(d);
                        const closed = ready ? (hours[weekdayOf(d)] ?? []).length === 0 : false;
                        return (
                            <button
                                key={d}
                                type="button"
                                aria-pressed={d === date}
                                aria-label={`${dayName(d)} ${dayNumber(d)}${d === today ? ', today' : ''}${closed ? ', closed' : `, ${n} appointments`}`}
                                onClick={() => go({ date: d })}
                                className="flex flex-col items-center gap-1.5"
                            >
                                <span className={cn('text-xs', d === date ? 'font-bold' : 'text-muted-foreground')}>{dayName(d)}</span>
                                <span
                                    className={cn(
                                        'flex size-10 items-center justify-center rounded-full text-base font-semibold',
                                        d === date && 'bg-primary font-bold text-primary-foreground',
                                        d !== date && d === today && 'border-[1.5px] border-primary',
                                    )}
                                >
                                    {dayNumber(d)}
                                </span>
                                <span className={cn('size-[5px] rounded-full', n > 0 && !closed ? 'bg-signal' : 'bg-transparent')} />
                            </button>
                        );
                    })}
                </div>
            )}

            {view === 'day' && (
                <div className="flex items-baseline justify-between">
                    <h2 className="text-xl font-bold leading-7">{date === today ? `Today, ${dayTitle(date).replace(/^\w+ /, '')}` : dayTitle(date)}</h2>
                    <span className="text-sm text-muted-foreground">
                        {ready && ((hours[weekdayOf(date)] ?? []).length === 0 ? 'Closed' : `${dayCount} ${dayCount === 1 ? 'appointment' : 'appointments'}`)}
                    </span>
                </div>
            )}

            {appointments.isError || workingHours.isError ? (
                <p role="alert" className="rounded-md bg-[var(--danger-soft)] p-3 text-destructive">
                    Couldn't load the Schedule. Reload to try again.
                </p>
            ) : !ready ? (
                <div aria-busy className="h-[480px] animate-pulse rounded-2xl bg-card" />
            ) : view === 'day' && (hours[weekdayOf(date)] ?? []).length === 0 && dayCount === 0 ? (
                <ClosedDay date={date} hours={hours} onOpen={(d) => go({ date: d })} />
            ) : (
                <div
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                    className="overflow-hidden rounded-2xl bg-card py-3 pr-1 shadow-sm"
                    style={{ touchAction: 'pan-y' }}
                >
                    {dayCount === 0 && view === 'day' && (
                        <p role="status" className="px-4 py-2 text-sm text-muted-foreground">
                            No appointments on this day. Tap a time to book one.
                        </p>
                    )}
                    <ScheduleGrid dates={shown} appointments={appointments.data!} hours={hours} />
                </div>
            )}
        </div>
    );
}

// A day with no Working Hours and no Appointments (a Sunday). Booking is still possible.
function ClosedDay({ date, hours, onOpen }: { date: string; hours: Record<number, Period[]>; onOpen: (date: string) => void }) {
    let next = addDays(date, 1);
    for (let i = 0; i < 7 && (hours[weekdayOf(next)] ?? []).length === 0; i++) next = addDays(next, 1);
    const firstOpen = hours[weekdayOf(next)]?.[0]?.open;
    return (
        <div className="flex flex-col gap-4">
            <div role="status" className="flex flex-col items-center gap-2.5 rounded-3xl bg-card px-6 py-8 text-center shadow-sm">
                <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
                    <Clock className="size-[26px]" />
                </span>
                <span className="text-xl font-bold leading-7">Outside Working Hours</span>
                <span className="text-[15px] leading-[22px] text-muted-foreground">The clinic is closed on {new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))}s. You can still create an appointment if you need to.</span>
                <Button asChild variant="secondary" className="mt-1.5 h-12 rounded-full px-6 text-base font-bold">
                    <Link to={`/appointments/new?date=${date}`}>
                        <Plus aria-hidden />
                        Create appointment
                    </Link>
                </Button>
            </div>
            {firstOpen !== undefined && (
                <button type="button" onClick={() => onOpen(next)} className="flex items-center justify-between rounded-[20px] bg-secondary px-[18px] py-4 text-left">
                    <span className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Next open day</span>
                        <span className="text-base font-bold">
                            {dayTitle(next)} · {formatMinutes(firstOpen)}
                        </span>
                    </span>
                    <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                </button>
            )}
        </div>
    );
}
