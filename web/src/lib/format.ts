const TIMEZONE = 'Asia/Manila';

// '2026-09-28' -> '28 Sep 2026'. The date is parsed as UTC and shown as UTC, so the device's own
// time zone cannot shift it by a day.
export function formatDate(isoDate: string): string {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${isoDate}T00:00:00Z`),
    );
}

// An appointment instant -> the clinic's wall clock: { day: '29', month: 'SEP', time: '4:30 PM' }.
export function clinicParts(instant: string) {
    const d = new Date(instant);
    const part = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, ...opts }).format(d);
    return {
        day: part({ day: 'numeric' }),
        month: part({ month: 'short' }).toUpperCase(),
        time: new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(d),
    };
}

// "0917 123 4567" -> "tel:09171234567"
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

// An instant -> the clinic's calendar date, 'YYYY-MM-DD' (what formatDate takes). 'en-CA' prints that shape.
export const clinicDateOf = (instant: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
