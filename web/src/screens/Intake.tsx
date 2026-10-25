import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { CheckCircle2, ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { patientRecordQuery, saveResult, type FieldErrors } from '@/lib/queries';
import { allErrors, emptyForm, errorsFor, stepOfError, stepsFor, stepTitle, toBody, type Form, type StepId } from './intake/form';
import { ConditionsStep, ConsentStep, DentalStep, GuardianStep, MedicalStep, PersonalStep, ReviewStep, type StepProps } from './intake/steps';

// docs/design-brief.md section 6: one question group per screen, progress shown, a review screen
// before saving. The Dentist hands the phone to the Patient, so controls are large and every field
// has a visible label with its error beside it. Every answer is checked by the same parseIntake the
// server runs on submit (worker/intake/validate.ts).
export function Intake() {
    const { id = '' } = useParams();
    const { data, isPending, error } = useQuery(patientRecordQuery(id));

    if (isPending) return <p className="text-muted-foreground">Loading…</p>;
    if (error) return <p role="alert" className="text-destructive">Couldn't load this Patient. Reload to try again.</p>;
    if (data === null) {
        return (
            <div>
                <h1 className="text-2xl font-bold">Patient not found</h1>
                <Link to="/patients" className="mt-2 inline-block font-bold text-signal">Back to Patients</Link>
            </div>
        );
    }
    if (!data.patient.flags.pendingIntake) {
        return (
            <div className="mx-auto flex max-w-[480px] flex-col gap-3">
                <h1 className="text-2xl font-bold">Intake already done</h1>
                <p className="text-muted-foreground">{data.patient.fullName} has completed their Intake.</p>
                <Button asChild className="h-12"><Link to={`/patients/${id}`}>Back to Patient Record</Link></Button>
            </div>
        );
    }

    const { patient } = data;
    return <IntakeFlow id={id} prefill={{ fullName: patient.fullName, mobilePhone: patient.mobilePhone ?? '', birthdate: patient.birthdate ?? '' }} />;
}

function IntakeFlow({ id, prefill }: { id: string; prefill: { fullName: string; mobilePhone: string; birthdate: string } }) {
    const queryClient = useQueryClient();
    // The Pending Intake Patient's name and phone are already on file, so they start filled in.
    const [form, setForm] = useState<Form>({ ...emptyForm, personal: { ...emptyForm.personal, ...prefill } });
    const [step, setStep] = useState<StepId>('personal');
    // Errors only appear after the Patient taps Next (or Save), then clear field by field as they type.
    const [shown, setShown] = useState<FieldErrors>({});
    const [done, setDone] = useState(false);

    const steps = stepsFor(form);
    const index = steps.indexOf(step);

    useEffect(() => window.scrollTo(0, 0), [step]);

    const set: StepProps['set'] = (section, key, value) => {
        setForm((f) => ({ ...f, [section]: { ...f[section], [key]: value } }));
        setShown((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== `${section}.${String(key)}` && k !== section)));
    };

    const save = useMutation({
        mutationFn: async () =>
            // The body is checked by parseIntake before this runs, so it matches what the route's type expects.
            saveResult<{ consentGivenOn: string }>(await api.api.patients[':id'].intake.$post({ param: { id }, json: toBody(form) as never })),
        onSuccess: async (result) => {
            if (!result.ok) {
                setShown(result.errors);
                const first = Object.keys(result.errors).map((k) => stepOfError(k, steps)).find(Boolean);
                if (first) setStep(first);
                return;
            }
            await queryClient.invalidateQueries({ queryKey: ['patients'] });
            setDone(true);
        },
    });

    function next() {
        const mine = errorsFor(step, allErrors(form));
        setShown(mine);
        if (Object.keys(mine).length === 0) setStep(steps[index + 1]);
    }

    function submit() {
        const all = allErrors(form);
        if (Object.keys(all).length > 0) {
            setShown(all);
            const first = steps.find((s) => Object.keys(errorsFor(s, all)).length > 0);
            if (first) setStep(first);
            return;
        }
        if (!save.isPending) save.mutate();
    }

    if (done) {
        return (
            <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 py-8 text-center" role="status">
                <CheckCircle2 className="size-16 text-success" aria-hidden />
                <h1 className="text-[24px] font-bold leading-[30px] tracking-tight">Intake complete</h1>
                <p className="text-muted-foreground">Thank you. Please hand the phone back to the Dentist.</p>
                <Button asChild className="h-12 w-full"><Link to={`/patients/${id}`}>Go to Patient Record</Link></Button>
            </div>
        );
    }

    const errors = errorsFor(step, shown);
    const props: StepProps = { form, errors, set };

    return (
        <div className="mx-auto flex max-w-[480px] flex-col gap-4 pb-24 md:pb-0">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                    <span>Step {index + 1} of {steps.length}</span>
                    <span>{stepTitle[step]}</span>
                </div>
                <div
                    role="progressbar"
                    aria-label="Intake progress"
                    aria-valuemin={1}
                    aria-valuemax={steps.length}
                    aria-valuenow={index + 1}
                    className="h-2 overflow-hidden rounded-full bg-border"
                >
                    <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
                </div>
            </div>

            <h1 className="text-[24px] font-bold leading-[30px] tracking-tight">
                {step === 'review' ? 'Check your answers' : stepTitle[step]}
            </h1>

            {step === 'personal' && <PersonalStep {...props} />}
            {step === 'guardian' && <GuardianStep {...props} />}
            {step === 'medical' && <MedicalStep {...props} />}
            {step === 'conditions' && <ConditionsStep {...props} />}
            {step === 'dental' && <DentalStep {...props} />}
            {step === 'consent' && (
                <ConsentStep form={form} errors={errors} onConsent={(v) => { setForm((f) => ({ ...f, consent: v })); setShown({}); }} />
            )}
            {step === 'review' && <ReviewStep form={form} goTo={setStep} />}

            {save.isError && (
                <p role="alert" className="rounded-md bg-[var(--danger-soft)] p-3 text-destructive">
                    Couldn't save. Check your connection and try again.
                </p>
            )}
            {step === 'review' && Object.keys(shown).length > 0 && (
                <p role="alert" className="rounded-md bg-[var(--danger-soft)] p-3 text-destructive">
                    Some answers need fixing. Tap Edit on that section.
                </p>
            )}

            <div className="fixed inset-x-0 bottom-[76px] z-10 border-t bg-background px-4 pb-3 pt-3 md:static md:border-0 md:bg-transparent md:p-0 md:pt-2">
                <div className="mx-auto flex max-w-[480px] gap-3">
                    {index === 0 ? (
                        <Button asChild variant="secondary" className="h-12 flex-1">
                            <Link to={`/patients/${id}`}><ChevronLeft aria-hidden />Cancel</Link>
                        </Button>
                    ) : (
                        <Button type="button" variant="secondary" className="h-12 flex-1" onClick={() => setStep(steps[index - 1])}>
                            <ChevronLeft aria-hidden />Back
                        </Button>
                    )}
                    {step === 'review' ? (
                        <Button type="button" className="h-12 flex-[2] text-base font-bold" disabled={save.isPending} onClick={submit}>
                            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
                            {save.isPending ? 'Saving…' : 'Save Intake'}
                        </Button>
                    ) : (
                        <Button type="button" className="h-12 flex-[2] text-base font-bold" onClick={next}>Next</Button>
                    )}
                </div>
            </div>
        </div>
    );
}
