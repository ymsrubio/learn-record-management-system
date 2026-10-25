import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { CalendarPlus, ChevronLeft, ClipboardCheck, Footprints, Hourglass, Archive, Loader2, MoreVertical, Pencil, Phone, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/Field';
import { LockBadge } from '@/components/LockBadge';
import { api } from '@/lib/api';
import { clinicDateOf, clinicParts, formatDate, telHref } from '@/lib/format';
import type { PresentedNote } from '../../../worker/notes/load';
import { patientRecordQuery, saveResult, type FieldErrors } from '@/lib/queries';

const statusLabel = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' } as const;

// docs/design-brief.md section 4, canvas record-phone-pending / record-phone-no-appointments.
// Header, Medical History alerts strip, Details, an empty Odontogram placeholder and the timeline.
export function PatientRecord() {
    const { id = '' } = useParams();
    const { data, isPending, error, refetch } = useQuery(patientRecordQuery(id));
    const [editing, setEditing] = useState(false);

    if (isPending) return <p className="text-muted-foreground">Loading Patient Record…</p>;
    if (error) {
        return (
            <div className="rounded-lg bg-[var(--danger-soft)] p-4 text-destructive">
                <p className="font-semibold">Couldn't load this Patient Record.</p>
                <Button variant="secondary" className="mt-3" onClick={() => refetch()}>
                    Try again
                </Button>
            </div>
        );
    }
    if (data === null) {
        return (
            <div>
                <h1 className="text-2xl font-bold">Patient not found</h1>
                <Link to="/patients" className="mt-2 inline-block font-bold text-signal">
                    Back to Patients
                </Link>
            </div>
        );
    }

    const { patient, alerts, timeline, details, guardian, consentGivenOn } = data;
    const first = patient.fullName.split(/\s+/)[0];
    const archived = patient.flags.archived;

    return (
        <div className="flex flex-col gap-4 pb-20 md:pb-0">
            <Link to="/patients" className="-ml-2 flex h-11 w-fit items-center gap-1 px-2 font-bold text-signal">
                <ChevronLeft className="size-5" aria-hidden />
                Patients
            </Link>

            <section className="flex flex-col gap-1 rounded-lg bg-card px-4 pb-2 pt-3 shadow-sm" aria-label="Patient">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold leading-[30px] tracking-tight">{patient.fullName}</h1>
                    {patient.flags.pendingIntake && (
                        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-warning-soft px-2 text-xs font-semibold text-warning">
                            <Hourglass className="size-3.5" aria-hidden />
                            Pending Intake
                        </span>
                    )}
                    {archived && (
                        <span className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
                            Archived
                        </span>
                    )}
                    {!archived && <OverflowMenu patientId={patient.id} />}
                </div>
                <p className="text-sm text-muted-foreground">
                    {patient.birthdate
                        ? `${patient.age} years old · born ${formatDate(patient.birthdate)}`
                        : 'No birthdate yet'}
                </p>
                {patient.mobilePhone && (
                    <a
                        href={telHref(patient.mobilePhone)}
                        className="flex h-11 w-fit items-center gap-2 font-bold text-signal"
                    >
                        <Phone className="size-[18px]" aria-hidden />
                        {patient.mobilePhone}
                    </a>
                )}
            </section>

            {archived && <ArchivedBanner patientId={patient.id} />}

            <section
                aria-label="Medical History alerts"
                className="flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 font-bold text-warning"
            >
                <TriangleAlert className="mt-1 size-[18px] shrink-0" aria-hidden />
                <span>
                    {alerts.length > 0 ? alerts.join(' · ') : 'No Medical History yet. Do the Intake before treating.'}
                </span>
            </section>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
                <div className="flex flex-col gap-4">
                    {patient.flags.pendingIntake && !archived && (
                        <section className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-sm">
                            <h2 className="flex items-center gap-3 font-bold">
                                <span className="flex size-10 items-center justify-center rounded-full bg-accent text-signal">
                                    <ClipboardCheck className="size-5" aria-hidden />
                                </span>
                                Intake not done yet
                            </h2>
                            <p>At the clinic, hand {first} the phone to fill in:</p>
                            <ul className="list-disc pl-5 text-muted-foreground">
                                <li>Personal details</li>
                                <li>Medical History</li>
                                <li>Consent under the Data Privacy Act</li>
                            </ul>
                        </section>
                    )}

                    <section className="overflow-hidden rounded-lg bg-card shadow-sm" aria-label="Details">
                        <div className="flex items-center justify-between pr-2">
                            <h2 className="px-4 pb-1 pt-3 font-bold">Details</h2>
                            {!editing && !archived && (
                                <Button variant="ghost" size="default" onClick={() => setEditing(true)}>
                                    <Pencil aria-hidden />
                                    Edit details
                                </Button>
                            )}
                        </div>
                        {editing ? (
                            <EditDetails
                                id={patient.id}
                                initial={patient}
                                onDone={() => setEditing(false)}
                            />
                        ) : (
                            <dl>
                                <Detail label="Full name" value={patient.fullName} />
                                <Detail label="Phone" value={patient.mobilePhone} />
                                <Detail label="Birthdate" value={patient.birthdate && formatDate(patient.birthdate)} />
                                <Detail label="Previous surname" value={details.previousSurname} />
                                <Detail label="Sex" value={details.sex && (details.sex === 'female' ? 'Female' : 'Male')} />
                                <Detail label="Occupation" value={details.occupation} />
                                <Detail label="Landline" value={details.landline} />
                                <Detail label="Email" value={details.email} />
                                <Detail label="Address" value={details.address} />
                                <Detail
                                    label="Emergency contact"
                                    value={details.emergencyContactName && `${details.emergencyContactName} · ${details.emergencyContactPhone}`}
                                />
                                <Detail label="Brief patient history" value={details.patientHistory} />
                                {guardian && (
                                    <Detail
                                        label="Guardian"
                                        value={`${guardian.name} (${guardian.relationship}) · ${guardian.phone}`}
                                    />
                                )}
                                <Detail label="Consent given" value={consentGivenOn && formatDate(consentGivenOn)} last />
                            </dl>
                        )}
                    </section>
                </div>

                <div className="flex flex-col gap-4">
                    <section
                        aria-label="Odontogram"
                        className="rounded-lg border border-dashed border-input p-4 text-muted-foreground"
                    >
                        <h2 className="font-bold text-foreground">Odontogram</h2>
                        <p className="text-sm">The tooth chart will appear here.</p>
                    </section>

                    <section aria-label="Timeline" className="flex flex-col gap-2">
                        <div className="mt-2 flex items-baseline justify-between gap-3">
                            <h2 className="text-xl font-bold">History</h2>
                            <span className="text-sm text-muted-foreground">
                                {timeline.length === 1 ? '1 Appointment' : `${timeline.length} Appointments`}
                            </span>
                        </div>
                        {timeline.length === 0 && archived && (
                            <div className="rounded-lg bg-card p-4 text-muted-foreground shadow-sm">No appointments.</div>
                        )}
                        {timeline.length === 0 && !archived && (
                            <div className="rounded-lg bg-card p-4 text-muted-foreground shadow-sm">
                                <p>No appointments yet.</p>
                                <Button asChild variant="secondary" className="mt-3">
                                    <Link to={`/appointments/new?patientId=${patient.id}`}>
                                        <CalendarPlus aria-hidden />
                                        Create appointment
                                    </Link>
                                </Button>
                            </div>
                        )}
                        {timeline.map((a) => {
                            const when = clinicParts(a.startAt);
                            return (
                                <div key={a.id} className="rounded-lg bg-card shadow-sm">
                                    <Link to={`/appointments/${a.id}`} className="flex items-start gap-3.5 px-4 py-3">
                                        <span className="flex w-9 shrink-0 flex-col items-center">
                                            <span className="text-[22px] font-bold leading-[26px]">{when.day}</span>
                                            <span className="text-[11px] font-bold leading-[14px] tracking-[0.08em] text-muted-foreground">
                                                {when.month}
                                            </span>
                                        </span>
                                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                            <span className="flex items-center justify-between gap-2">
                                                <span className="truncate font-bold">{a.reason ?? 'Appointment'}</span>
                                                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-signal">
                                                    {statusLabel[a.status]}
                                                </span>
                                            </span>
                                            <span className="text-sm text-muted-foreground">{when.time}</span>
                                        </span>
                                    </Link>
                                    {a.note && <TimelineNote appointmentId={a.id} note={a.note} />}
                                    {!a.note && a.status === 'completed' && !archived && (
                                        <Link to={`/appointments/${a.id}/note`} className="flex h-11 items-center border-t px-4 font-bold text-signal">
                                            Write Treatment Note
                                        </Link>
                                    )}
                                </div>
                            );
                        })}
                    </section>
                </div>
            </div>

            {!archived && (
            <div className="fixed inset-x-0 bottom-[76px] z-10 flex gap-2 bg-background px-4 pb-3 pt-2 md:static md:bg-transparent md:p-0">
                <Button asChild variant="secondary" size="icon" className="size-12" aria-label="Create appointment">
                    <Link to={`/appointments/new?patientId=${patient.id}`}>
                        <CalendarPlus aria-hidden />
                    </Link>
                </Button>
                <Button asChild variant="secondary" size="icon" className="size-12" aria-label="Walk-in">
                    <Link to={`/appointments/new?walkin=1&patientId=${patient.id}`}>
                        <Footprints aria-hidden />
                    </Link>
                </Button>
                {patient.flags.pendingIntake && (
                    <Button asChild className="h-12 flex-1 text-base font-bold md:max-w-xs">
                        <Link to={`/patients/${patient.id}/intake`}>
                            <ClipboardCheck aria-hidden />
                            Start Intake
                        </Link>
                    </Button>
                )}
            </div>
            )}
        </div>
    );
}

function TimelineNote({ appointmentId, note }: { appointmentId: string; note: PresentedNote }) {
    return (
        <div className="flex flex-col gap-2 border-t px-4 py-3">
            <Link to={`/appointments/${appointmentId}/note`} className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Treatment Note</span>
                    {note.locked && <LockBadge />}
                </span>
                <span className="line-clamp-3 whitespace-pre-wrap"><b>Findings:</b> {note.findings}</span>
                <span className="line-clamp-3 whitespace-pre-wrap"><b>Treatment done:</b> {note.treatmentDone}</span>
                {note.nextSteps && <span className="line-clamp-3 whitespace-pre-wrap"><b>Next steps:</b> {note.nextSteps}</span>}
            </Link>
            {note.amendments.map((am) => (
                <div key={am.id} className="rounded-md bg-muted p-3 ring-1 ring-border">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Amendment</p>
                    <p className="whitespace-pre-wrap">{am.text}</p>
                    <p className="text-sm text-muted-foreground">
                        {am.writtenBy ?? 'a former user'} · {formatDate(clinicDateOf(am.writtenAt))}, {clinicParts(am.writtenAt).time}
                    </p>
                </div>
            ))}
        </div>
    );
}

function Detail({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
    return (
        <div className={`flex flex-col px-4 py-2 ${last ? 'pb-3' : 'border-b'}`}>
            <dt className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{label}</dt>
            <dd className={value ? '' : 'text-muted-foreground'}>{value || 'Not recorded yet'}</dd>
        </div>
    );
}

type Details = { fullName: string; mobilePhone: string | null; birthdate: string | null };

function EditDetails({ id, initial, onDone }: { id: string; initial: Details; onDone: () => void }) {
    const queryClient = useQueryClient();
    const [fullName, setFullName] = useState(initial.fullName);
    const [mobilePhone, setMobilePhone] = useState(initial.mobilePhone ?? '');
    const [birthdate, setBirthdate] = useState(initial.birthdate ?? '');
    const [errors, setErrors] = useState<FieldErrors>({});

    const save = useMutation({
        mutationFn: async () => saveResult(await api.api.patients[':id'].$patch({ param: { id }, json: { fullName, mobilePhone, birthdate: birthdate || null } })),
        onSuccess: async (result) => {
            if (!result.ok) return setErrors(result.errors);
            await queryClient.invalidateQueries({ queryKey: ['patients'] });
            onDone();
        },
    });

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (!save.isPending) save.mutate();
    }

    return (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-4 pt-2">
            <Field id="edit-name" label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} />
            <Field
                id="edit-phone"
                label="Phone"
                type="tel"
                inputMode="tel"
                value={mobilePhone}
                onChange={(e) => setMobilePhone(e.target.value)}
                error={errors.mobilePhone}
            />
            <Field id="edit-birthdate" label="Birthdate" type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} error={errors.birthdate} />
            {save.isError && (
                <p role="alert" className="text-destructive">
                    Couldn't save. Try again.
                </p>
            )}
            <div className="flex gap-2">
                <Button type="button" variant="secondary" className="h-12 flex-1" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={save.isPending} className="h-12 flex-1">
                    {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
                    Save details
                </Button>
            </div>
        </form>
    );
}

// Archive and Restore are plain POSTs that flip archived_at. Both refetch the record and the
// search lists, so the badge, the banner and the results stay in step with the server.
function useArchiveToggle(patientId: string, action: 'archive' | 'restore') {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const res = await api.api.patients[':id'][action].$post({ param: { id: patientId } });
            if (!res.ok) throw new Error(`${action} failed with ${res.status}`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patients'] }),
    });
}

function OverflowMenu({ patientId }: { patientId: string }) {
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const archive = useArchiveToggle(patientId, 'archive');

    function close() {
        setOpen(false);
        setConfirming(false);
    }

    return (
        <div className="relative ml-auto">
            <Button variant="ghost" size="icon" className="size-11" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
                <MoreVertical aria-hidden />
            </Button>
            {open && (
                <div role="menu" className="absolute right-0 top-12 z-20 w-64 rounded-lg bg-card p-2 shadow-lg ring-1 ring-border">
                    {!confirming ? (
                        <button role="menuitem" className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left font-bold hover:bg-muted" onClick={() => setConfirming(true)}>
                            <Archive className="size-[18px]" aria-hidden />
                            Archive patient
                        </button>
                    ) : (
                        <div className="flex flex-col gap-2 p-1">
                            <p className="text-sm">They will leave normal search. Their record stays and you can Restore it.</p>
                            {archive.isError && <p role="alert" className="text-sm text-destructive">Couldn't archive. Try again.</p>}
                            <div className="flex gap-2">
                                <Button variant="secondary" className="h-11 flex-1" onClick={close}>Cancel</Button>
                                <Button className="h-11 flex-1" disabled={archive.isPending} onClick={() => archive.mutate(undefined, { onSuccess: close })}>
                                    {archive.isPending && <Loader2 className="animate-spin" aria-hidden />}
                                    Archive
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ArchivedBanner({ patientId }: { patientId: string }) {
    const restore = useArchiveToggle(patientId, 'restore');
    return (
        <section aria-label="Archived" className="flex flex-col gap-3 rounded-lg bg-muted p-4 ring-1 ring-border sm:flex-row sm:items-center sm:justify-between">
            <p>
                <b>This Patient is Archived.</b> The record is read-only. Restore to make changes.
            </p>
            {restore.isError && <p role="alert" className="text-sm text-destructive">Couldn't restore. Try again.</p>}
            <Button className="h-12 sm:shrink-0" disabled={restore.isPending} onClick={() => restore.mutate()}>
                {restore.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
                Restore
            </Button>
        </section>
    );
}
