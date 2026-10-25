import { asc, eq, inArray } from 'drizzle-orm';
import type { getDb } from '../db/client';
import { amendments, treatmentNotes, user } from '../db/schema';
import { isLocked } from './rules';

type Db = ReturnType<typeof getDb>;

// Notes for the given Appointments, keyed by appointment id, each with its Amendments oldest first.
export async function loadNotes(db: Db, appointmentIds: string[], today: string) {
    if (appointmentIds.length === 0) return new Map<string, ReturnType<typeof presentNote>>();
    const notes = await db
        .select({ n: treatmentNotes, author: user.name })
        .from(treatmentNotes)
        .leftJoin(user, eq(user.id, treatmentNotes.writtenBy))
        .where(inArray(treatmentNotes.appointmentId, appointmentIds));
    const noteIds = notes.map((r) => r.n.id);
    const rows = noteIds.length
        ? await db
              .select({ a: amendments, author: user.name })
              .from(amendments)
              .leftJoin(user, eq(user.id, amendments.writtenBy))
              .where(inArray(amendments.treatmentNoteId, noteIds))
              .orderBy(asc(amendments.writtenAt))
        : [];
    return new Map(
        notes.map((r) => [
            r.n.appointmentId,
            presentNote(
                r.n,
                r.author,
                today,
                rows.filter((x) => x.a.treatmentNoteId === r.n.id),
            ),
        ]),
    );
}

export function presentNote(
    n: typeof treatmentNotes.$inferSelect,
    author: string | null,
    today: string,
    amendmentRows: { a: typeof amendments.$inferSelect; author: string | null }[],
) {
    return {
        id: n.id,
        appointmentId: n.appointmentId,
        findings: n.findings,
        treatmentDone: n.treatmentDone,
        nextSteps: n.nextSteps,
        writtenBy: author,
        writtenAt: n.writtenAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
        locked: isLocked(n.writtenAt, today),
        amendments: amendmentRows.map(({ a, author: by }) => ({
            id: a.id,
            text: a.text,
            writtenBy: by,
            writtenAt: a.writtenAt.toISOString(),
        })),
    };
}

export type PresentedNote = ReturnType<typeof presentNote>;
