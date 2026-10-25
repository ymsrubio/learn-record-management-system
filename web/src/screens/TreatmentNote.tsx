import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ChevronLeft, Loader2, MessageSquarePlus, Pencil, TriangleAlert } from 'lucide-react';
import { LockBadge } from '@/components/LockBadge';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/screens/intake/controls';
import { api } from '@/lib/api';
import { clinicParts, formatDate, clinicDateOf } from '@/lib/format';
import { saveResult, treatmentNoteQuery, type FieldErrors } from '@/lib/queries';

type Loaded = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof treatmentNoteQuery>['queryFn']>>>>;
type Note = NonNullable<Loaded['note']>;

// A 409 from the server: its message is written for the Dentist and is shown as is.
class Refused extends Error {}

const writtenOn = (instant: string) => `${formatDate(clinicDateOf(instant))}, ${clinicParts(instant).time}`;

// /appointments/:id/note. docs/design-brief.md section 9, canvas note-phone-new / -editing / -amendments.
// Four states: writing a new note, editing one written today, Locked, Locked with Amendments.
// The server decides what is Locked (`note.locked`); the screen only follows it.
export function TreatmentNote() {
    const { id = '' } = useParams();
    const { data, isPending, error, refetch } = useQuery(treatmentNoteQuery(id));
    const [editing, setEditing] = useState(false);
    const [amending, setAmending] = useState(false);

    if (isPending) return <p className="text-muted-foreground">Loading Treatment Note…</p>;
    if (error) {
        return (
            <div className="rounded-lg bg-[var(--danger-soft)] p-4 text-destructive">
                <p className="font-semibold">Couldn't load this Treatment Note.</p>
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

    const { appointment, alerts, note } = data;
    const when = clinicParts(appointment.startAt);
    const canWrite = appointment.status === 'completed';

    return (
        <div className="mx-auto flex max-w-[640px] flex-col gap-4 pb-24 md:pb-0">
            <Link to={`/patients/${appointment.patientId}`} className="-ml-2 flex h-11 w-fit items-center gap-1 px-2 font-bold text-signal">
                <ChevronLeft className="size-5" aria-hidden />
                {appointment.patientName}
            </Link>

            <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-bold leading-[30px] tracking-tight">Treatment Note</h1>
                {note?.locked && <LockBadge />}
            </div>
            <p className="-mt-3 text-sm text-muted-foreground">
                {formatDate(clinicDateOf(appointment.startAt))}, {when.time}
                {appointment.reason ? ` · ${appointment.reason}` : ''}
            </p>

            <section aria-label="Medical History alerts" className="flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 font-bold text-warning">
                <TriangleAlert className="mt-1 size-[18px] shrink-0" aria-hidden />
                <span>{alerts.length > 0 ? alerts.join(' · ') : 'No Medical History yet. Do the Intake before treating.'}</span>
            </section>

            {!note && !canWrite && (
                <p className="rounded-lg bg-card p-4 text-muted-foreground shadow-sm">
                    A Treatment Note can only be written on a Completed Appointment.{' '}
                    <Link to={`/appointments/${appointment.id}`} className="font-bold text-signal">
                        Open the Appointment
                    </Link>
                </p>
            )}
            {!note && canWrite && <NoteForm appointmentId={appointment.id} initial={null} onDone={() => {}} />}
            {note && editing && !note.locked ? (
                <NoteForm appointmentId={appointment.id} initial={note} onDone={() => setEditing(false)} />
            ) : (
                note && (
                    <>
                        <NoteBody note={note} />
                        {!note.locked && (
                            <Button className="h-12" onClick={() => setEditing(true)}>
                                <Pencil aria-hidden />
                                Edit note
                            </Button>
                        )}
                        {note.locked && !amending && (
                            <Button className="h-12" onClick={() => setAmending(true)}>
                                <MessageSquarePlus aria-hidden />
                                Add amendment
                            </Button>
                        )}
                        {note.locked && amending && <AmendmentForm appointmentId={appointment.id} onDone={() => setAmending(false)} />}
                    </>
                )
            )}
        </div>
    );
}

function NoteBody({ note }: { note: Note }) {
    const sections: [string, string | null][] = [
        ['Findings', note.findings],
        ['Treatment done', note.treatmentDone],
        ['Next steps', note.nextSteps],
    ];
    return (
        <section aria-label="Treatment Note" className="flex flex-col overflow-hidden rounded-lg bg-card shadow-sm">
            {sections.map(([label, text]) => (
                <div key={label} className="flex flex-col border-b px-4 py-3">
                    <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{label}</h2>
                    <p className={`whitespace-pre-wrap ${text ? '' : 'text-muted-foreground'}`}>{text || 'None'}</p>
                </div>
            ))}
            <p className="px-4 py-3 text-sm text-muted-foreground">
                Written by {note.writtenBy ?? 'a former user'} · {writtenOn(note.writtenAt)}
            </p>
            {note.amendments.length > 0 && (
                <div aria-label="Amendments" className="flex flex-col gap-2 border-t bg-muted px-4 py-3">
                    <h2 className="font-bold">Amendments</h2>
                    {note.amendments.map((a) => (
                        <div key={a.id} className="rounded-md bg-card p-3 ring-1 ring-border">
                            <p className="whitespace-pre-wrap">{a.text}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {a.writtenBy ?? 'a former user'} · {writtenOn(a.writtenAt)}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function useRefreshNote(appointmentId: string) {
    const queryClient = useQueryClient();
    return async () => {
        await queryClient.invalidateQueries({ queryKey: ['appointments', appointmentId] });
        await queryClient.invalidateQueries({ queryKey: ['patients'] });
    };
}

function NoteForm({ appointmentId, initial, onDone }: { appointmentId: string; initial: Note | null; onDone: () => void }) {
    const refresh = useRefreshNote(appointmentId);
    const [findings, setFindings] = useState(initial?.findings ?? '');
    const [treatmentDone, setTreatmentDone] = useState(initial?.treatmentDone ?? '');
    const [nextSteps, setNextSteps] = useState(initial?.nextSteps ?? '');
    const [errors, setErrors] = useState<FieldErrors>({});

    const save = useMutation({
        mutationFn: async () => {
            const json = { findings, treatmentDone, nextSteps };
            const res = initial
                ? await api.api.appointments[':id'].note.$patch({ param: { id: appointmentId }, json })
                : await api.api.appointments[':id'].note.$post({ param: { id: appointmentId }, json });
            // 409 note_locked: the clinic day ended while the form was open. Refresh to show the Locked note.
            if (res.status === 409) {
                await refresh();
                throw new Refused(((await res.json()) as { error: string }).error);
            }
            return saveResult<unknown>(res);
        },
        onSuccess: async (result) => {
            if (!result.ok) return setErrors(result.errors);
            setErrors({});
            await refresh();
            onDone();
        },
    });

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (!save.isPending) save.mutate();
    }

    return (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <TextArea id="findings" label="Findings" rows={4} value={findings} onChange={(e) => setFindings(e.target.value)} error={errors.findings} />
            <TextArea id="treatment-done" label="Treatment done" rows={4} value={treatmentDone} onChange={(e) => setTreatmentDone(e.target.value)} error={errors.treatmentDone} />
            <TextArea id="next-steps" label="Next steps (optional)" rows={3} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} error={errors.nextSteps} />
            {save.isError && (
                <p role="alert" className="rounded-md bg-[var(--danger-soft)] p-3 text-destructive">
                    {save.error instanceof Refused ? save.error.message : "Couldn't save. Check your connection and try again."}
                </p>
            )}
            <div className="flex gap-2">
                {initial && (
                    <Button type="button" variant="secondary" className="h-12 flex-1" onClick={onDone}>
                        Cancel
                    </Button>
                )}
                <Button type="submit" disabled={save.isPending} className="h-12 flex-1 text-base font-bold">
                    {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
                    {initial ? 'Save changes' : 'Save note'}
                </Button>
            </div>
        </form>
    );
}

function AmendmentForm({ appointmentId, onDone }: { appointmentId: string; onDone: () => void }) {
    const refresh = useRefreshNote(appointmentId);
    const [text, setText] = useState('');
    const [errors, setErrors] = useState<FieldErrors>({});

    const save = useMutation({
        mutationFn: async () => saveResult<unknown>(await api.api.appointments[':id'].note.amendments.$post({ param: { id: appointmentId }, json: { text } })),
        onSuccess: async (result) => {
            if (!result.ok) return setErrors(result.errors);
            await refresh();
            onDone();
        },
    });

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (!save.isPending) save.mutate();
    }

    return (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-sm">
            <TextArea id="amendment" label="Amendment" rows={3} value={text} onChange={(e) => setText(e.target.value)} error={errors.text} />
            <p className="-mt-2 text-sm text-muted-foreground">The original note stays as written. Amendments can't be changed later.</p>
            {save.isError && (
                <p role="alert" className="rounded-md bg-[var(--danger-soft)] p-3 text-destructive">
                    Couldn't save. Check your connection and try again.
                </p>
            )}
            <div className="flex gap-2">
                <Button type="button" variant="secondary" className="h-12 flex-1" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={save.isPending} className="h-12 flex-1 text-base font-bold">
                    {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
                    Save amendment
                </Button>
            </div>
        </form>
    );
}
