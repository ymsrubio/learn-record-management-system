import { sql, type SQL } from 'drizzle-orm';
import { ageOn } from '../clock';
import type { getDb } from '../db/client';
import { normalizeName, normalizePhone } from './normalize';

export const SEARCH_LIMIT = 25;
export const DUPLICATE_LIMIT = 5;

export type MatchedOn = 'name' | 'previousSurname' | 'phone' | 'guardianPhone';

// What a typed query means: words that must each start a name word, and one phone fragment.
export type SearchQuery = { words: string[]; phone: string | null };

const isDigit = (ch: string) => ch >= '0' && ch <= '9';

// "sant mar" -> words [sant, mar]. "0917 123 4567" -> phone "9171234567": tokens that are mostly
// digits are glued together (a formatted number arrives in pieces), then reduced like a stored
// phone. Fewer than 4 digits is too short to mean a phone, so it is ignored.
export function parseSearchQuery(text: string): SearchQuery {
    const words: string[] = [];
    let digits = '';
    for (const token of normalizeName(text).split(' ').filter(Boolean)) {
        const digitCount = [...token].filter(isDigit).length;
        if (digitCount * 2 > token.length) digits += token.replace(/\D/g, '');
        else words.push(token);
    }
    let phone: string | null = null;
    if (digits.length >= 10) phone = normalizePhone(digits);
    else if (digits.length >= 4) phone = digits.replace(/^0+/, '') || null;
    return { words, phone };
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, '\\$&');

// A word matches when it starts some word of the name: at the start of the string or after a space.
function nameWord(column: SQL, word: string) {
    const w = likeEscape(word);
    return sql`(${column} LIKE ${w + '%'} ESCAPE '\\' OR ${column} LIKE ${'% ' + w + '%'} ESCAPE '\\')`;
}

const nameWordMatches = (word: string) =>
    sql`(${nameWord(sql`p.name_search`, word)} OR ${nameWord(sql`p.previous_surname_search`, word)})`;

const phoneMatches = (phone: string) => {
    const like = `%${likeEscape(phone)}%`;
    return sql`(p.phone_search LIKE ${like} ESCAPE '\\' OR g.phone_search LIKE ${like} ESCAPE '\\')`;
};

export type SearchOptions = {
    includeArchived: boolean;
    limit: number;
    // 'all': every word and the phone must match. 'any': the name words together, or the phone.
    // The duplicate check uses 'any' because a returning Patient may give a new phone or a typo.
    combine: 'all' | 'any';
};

type Row = {
    id: string;
    full_name: string;
    mobile_phone: string | null;
    birthdate: string | null;
    intake_completed_at: number | null;
    archived_at: number | null;
    name_search: string;
    phone_search: string | null;
    guardian_phone_search: string | null;
    last_appointment_at: number | null;
};

type Db = ReturnType<typeof getDb>;

export type PatientHit = ReturnType<typeof present>;

function present(row: Row, today: string) {
    return {
        id: row.id,
        fullName: row.full_name,
        mobilePhone: row.mobile_phone,
        birthdate: row.birthdate,
        age: row.birthdate ? ageOn(row.birthdate, today) : null,
        lastAppointmentAt: row.last_appointment_at === null ? null : new Date(row.last_appointment_at).toISOString(),
        flags: { pendingIntake: row.intake_completed_at === null, archived: row.archived_at !== null },
    };
}

// The columns every list needs, with the Guardian's phone joined in and the latest Appointment
// that has already started. Future Appointments are not "last".
const selectPatients = (now: Date) => sql`
    SELECT p.id, p.full_name, p.mobile_phone, p.birthdate, p.intake_completed_at, p.archived_at,
        p.name_search, p.phone_search, g.phone_search AS guardian_phone_search,
        (SELECT max(a.start_at) FROM appointments a WHERE a.patient_id = p.id AND a.start_at <= ${now.getTime()})
            AS last_appointment_at
    FROM patients p LEFT JOIN guardians g ON g.id = p.guardian_id`;

function reasonFor(row: Row, q: SearchQuery): MatchedOn {
    const guardianOnly =
        q.phone !== null &&
        !(row.phone_search ?? '').includes(q.phone) &&
        (row.guardian_phone_search ?? '').includes(q.phone);
    if (guardianOnly) return 'guardianPhone';
    const inName = q.words.every((w) => row.name_search === w || row.name_search.startsWith(w) || row.name_search.includes(` ${w}`));
    if (q.words.length > 0 && !inName) return 'previousSurname';
    return q.phone !== null ? 'phone' : 'name';
}

export async function searchPatients(db: Db, q: SearchQuery, opts: SearchOptions, now: Date, today: string) {
    const nameConds = q.words.map(nameWordMatches);
    const nameCond = nameConds.length > 0 ? sql.join(nameConds, sql` AND `) : null;
    const phoneCond = q.phone !== null ? phoneMatches(q.phone) : null;

    let match: SQL | null;
    if (nameCond && phoneCond) match = opts.combine === 'all' ? sql`(${nameCond}) AND ${phoneCond}` : sql`((${nameCond}) OR ${phoneCond})`;
    else match = nameCond ? sql`(${nameCond})` : phoneCond;
    if (!match) return [];

    const archived = opts.includeArchived ? sql`1` : sql`p.archived_at IS NULL`;
    const exact =
        q.phone !== null
            ? sql`CASE WHEN p.phone_search = ${q.phone} OR g.phone_search = ${q.phone} THEN 0 ELSE 1 END`
            : sql`0 + 0`; // not a bare integer, which ORDER BY would read as a column position

    const rows = await db.all<Row>(sql`${selectPatients(now)}
        WHERE ${archived} AND ${match}
        ORDER BY ${exact}, coalesce(last_appointment_at, -1) DESC, p.name_search
        LIMIT ${opts.limit}`);

    return rows.map((row) => ({ ...present(row, today), matchedOn: reasonFor(row, q) }));
}

// The Patients this User opened most recently, newest first. Archived Patients are left out.
export async function recentPatients(db: Db, userId: string, limit: number, now: Date, today: string) {
    const rows = await db.all<Row>(sql`${selectPatients(now)}
        JOIN patient_views v ON v.patient_id = p.id AND v.user_id = ${userId}
        WHERE p.archived_at IS NULL
        ORDER BY v.last_viewed_at DESC
        LIMIT ${limit}`);
    return rows.map((row) => present(row, today));
}
