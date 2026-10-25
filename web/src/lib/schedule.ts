// Pure helpers for the Schedule screen. Dates are clinic calendar dates ('YYYY-MM-DD') and times
// are minutes after clinic midnight, so nothing here depends on the device's time zone.

export const clinicToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export function clinicMinutesNow(): number {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return get('hour') * 60 + get('minute');
}

const DAY_MS = 86_400_000;
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export const addDays = (date: string, days: number) => new Date(utc(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);

// 0 = Sunday, like Date.getUTCDay and the keys of WORKING_HOURS on the Worker.
export const weekdayOf = (date: string) => utc(date).getUTCDay();

// The Monday on or before a date. The week view runs Monday to Sunday.
export const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

export const weekOf = (date: string) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i));

export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const formatMinutes = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = String(minutes % 60).padStart(2, '0');
    return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

const label = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(utc(date));
export const dayName = (date: string) => label(date, { weekday: 'short' });
export const dayNumber = (date: string) => label(date, { day: 'numeric' });
export const dayTitle = (date: string) => label(date, { weekday: 'long', day: 'numeric', month: 'short' });
export const monthTitle = (dates: string[]) => {
    const first = label(dates[0], { month: 'short', year: 'numeric' });
    const last = label(dates[dates.length - 1], { month: 'short', year: 'numeric' });
    if (first === last) return label(dates[0], { month: 'long', year: 'numeric' });
    return label(dates[0], { month: 'short' }) + ' – ' + last;
};

export type Placed<T> = { item: T; start: number; end: number; lane: number; lanes: number };

// Side-by-side layout. Appointments that overlap, directly or through a chain, form a cluster. Each
// one takes the first lane that is free when it starts, and every member of a cluster shares that
// cluster's lane count, so a block's width is 1 / lanes of the column.
export function placeInLanes<T>(items: T[], range: (item: T) => { start: number; end: number }): Placed<T>[] {
    const sorted = items
        .map((item) => ({ item, ...range(item) }))
        .sort((a, b) => a.start - b.start || b.end - a.end);

    const placed: Placed<T>[] = [];
    let cluster: Placed<T>[] = [];
    let laneEnds: number[] = [];
    let clusterEnd = 0;

    const closeCluster = () => {
        for (const p of cluster) p.lanes = laneEnds.length;
        cluster = [];
        laneEnds = [];
    };

    for (const entry of sorted) {
        if (cluster.length > 0 && entry.start >= clusterEnd) closeCluster();
        let lane = laneEnds.findIndex((end) => end <= entry.start);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = entry.end;
        clusterEnd = Math.max(clusterEnd, entry.end);
        const p: Placed<T> = { ...entry, lane, lanes: 1 };
        cluster.push(p);
        placed.push(p);
    }
    closeCluster();
    return placed;
}
