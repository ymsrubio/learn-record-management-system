import { useQuery } from '@tanstack/react-query';
import { Field } from '@/components/Field';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ALLERGIES, CONDITIONS, SYMPTOMS, labelOf } from '../../../../worker/intake/lists';
import { ageOf, isMinor, type Form } from './form';
import { Checklist, Choices, TextArea, yesNo } from './controls';

export type Errors = Record<string, string>;
type Section = 'personal' | 'guardian' | 'medical' | 'dental';
export type StepProps = { form: Form; errors: Errors; set: <S extends Section>(section: S, key: keyof Form[S], value: unknown) => void };

const text = (props: StepProps, section: Section, key: string, label: string, extra: Record<string, unknown> = {}) => {
    const path = `${section}.${key}`;
    return (
        <Field
            id={path}
            label={label}
            value={String((props.form[section] as Record<string, unknown>)[key])}
            onChange={(e) => props.set(section, key as never, e.target.value)}
            error={props.errors[path] ?? (section === 'guardian' ? props.errors[`guardian.${key}`] : undefined)}
            {...extra}
        />
    );
};

export function PersonalStep(props: StepProps) {
    const { form, errors, set } = props;
    return (
        <div className="flex flex-col gap-4">
            {text(props, 'personal', 'fullName', 'Full name', { autoComplete: 'name' })}
            {text(props, 'personal', 'previousSurname', 'Previous surname (optional)')}
            {text(props, 'personal', 'birthdate', 'Birthdate', { type: 'date' })}
            <Choices
                id="personal.sex"
                label="Sex"
                options={[{ value: 'female' as const, label: 'Female' }, { value: 'male' as const, label: 'Male' }]}
                value={form.personal.sex}
                onChange={(v) => set('personal', 'sex', v)}
                error={errors['personal.sex']}
            />
            {text(props, 'personal', 'occupation', 'Occupation')}
            {text(props, 'personal', 'mobilePhone', 'Mobile phone', { type: 'tel', inputMode: 'tel' })}
            {text(props, 'personal', 'landline', 'Landline (optional)', { type: 'tel', inputMode: 'tel' })}
            {text(props, 'personal', 'email', 'Email (optional)', { type: 'email', inputMode: 'email', autoComplete: 'email' })}
            {text(props, 'personal', 'address', 'Address', { autoComplete: 'street-address' })}
            {text(props, 'personal', 'emergencyContactName', 'Emergency contact name')}
            {text(props, 'personal', 'emergencyContactPhone', 'Emergency contact phone', { type: 'tel', inputMode: 'tel' })}
            <TextArea
                id="personal.patientHistory"
                label="Brief patient history (optional)"
                value={form.personal.patientHistory}
                onChange={(e) => set('personal', 'patientHistory', e.target.value)}
                error={errors['personal.patientHistory']}
            />
        </div>
    );
}

export function GuardianStep(props: StepProps) {
    const { form, errors, set } = props;
    const phone = form.guardian.phone;
    // A sibling's Intake already saved this Guardian: offer to reuse that one instead of typing again.
    const found = useQuery({
        queryKey: ['guardians', phone],
        enabled: phone.replace(/\D/g, '').length >= 7,
        queryFn: async () => {
            const res = await api.api.guardians.$get({ query: { phone } });
            if (!res.ok) throw new Error(`GET /api/guardians failed with ${res.status}`);
            return (await res.json()).guardians;
        },
    });
    const matches = (found.data ?? []).filter((g) => g.id !== form.guardian.id);

    return (
        <div className="flex flex-col gap-4">
            <p className="rounded-md bg-accent p-3 text-sm">
                {form.personal.fullName || 'The Patient'} is under 18, so a Guardian gives the details and consent.
            </p>
            {errors.guardian && (
                <p role="alert" className="text-sm text-destructive">
                    {errors.guardian}
                </p>
            )}
            {text(props, 'guardian', 'name', "Guardian's full name")}
            {text(props, 'guardian', 'relationship', 'Relationship to the Patient')}
            {text(props, 'guardian', 'phone', "Guardian's phone", { type: 'tel', inputMode: 'tel' })}
            {form.guardian.id && <p className="text-sm text-muted-foreground">Using a Guardian already on file. Changes here update every sibling.</p>}
            {matches.map((g) => (
                <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                        for (const k of ['id', 'name', 'relationship', 'phone'] as const) set('guardian', k, g[k]);
                    }}
                    className="rounded-lg border border-signal bg-card p-4 text-left"
                >
                    <span className="block font-bold">Use {g.name}</span>
                    <span className="text-sm text-muted-foreground">
                        {g.relationship} · {g.phone} · already on file for a sibling
                    </span>
                </button>
            ))}
        </div>
    );
}

export function MedicalStep(props: StepProps) {
    const { form, errors, set } = props;
    const m = form.medical;
    const yn = (key: 'seriousIllness' | 'bloodTransfusion' | 'pregnant' | 'nursing' | 'birthControl', label: string) => (
        <Choices id={`medical.${key}`} label={label} options={yesNo} value={m[key]} onChange={(v) => set('medical', key, v)} error={errors[`medical.${key}`]} />
    );
    return (
        <div className="flex flex-col gap-5">
            {yn('seriousIllness', 'Have you had a serious illness or operation?')}
            {m.seriousIllness && (
                <TextArea
                    id="medical.seriousIllnessDetails"
                    label="Describe the illness or operation"
                    value={m.seriousIllnessDetails}
                    onChange={(e) => set('medical', 'seriousIllnessDetails', e.target.value)}
                    error={errors['medical.seriousIllnessDetails']}
                />
            )}
            {yn('bloodTransfusion', 'Have you had a blood transfusion?')}
            {m.bloodTransfusion && (
                <Field
                    id="medical.transfusionDates"
                    label="Approximate dates (optional)"
                    value={m.transfusionDates}
                    onChange={(e) => set('medical', 'transfusionDates', e.target.value)}
                    error={errors['medical.transfusionDates']}
                />
            )}
            {form.personal.sex === 'female' && (
                <>
                    {yn('pregnant', 'Are you pregnant?')}
                    {yn('nursing', 'Are you nursing?')}
                    {yn('birthControl', 'Are you taking birth control pills?')}
                </>
            )}
            <TextArea
                id="medical.medications"
                label="Medications you take now (optional)"
                value={m.medications}
                onChange={(e) => set('medical', 'medications', e.target.value)}
                error={errors['medical.medications']}
            />
            <Checklist id="medical.allergies" legend="Allergies" items={ALLERGIES} selected={m.allergies} onChange={(k) => set('medical', 'allergies', k)} error={errors['medical.allergies']} />
            <Field
                id="medical.allergiesOther"
                label="Other allergies (optional)"
                value={m.allergiesOther}
                onChange={(e) => set('medical', 'allergiesOther', e.target.value)}
                error={errors['medical.allergiesOther']}
            />
        </div>
    );
}

export function ConditionsStep({ form, errors, set }: StepProps) {
    return (
        <Checklist
            id="medical.conditions"
            legend="Tick any you have or had"
            items={CONDITIONS}
            selected={form.medical.conditions}
            onChange={(k) => set('medical', 'conditions', k)}
            searchable
            error={errors['medical.conditions']}
        />
    );
}

export function DentalStep(props: StepProps) {
    const { form, errors, set } = props;
    return (
        <div className="flex flex-col gap-4">
            {text(props, 'dental', 'visitReason', "Reason for today's visit")}
            {text(props, 'dental', 'formerDentistName', 'Former dentist (optional)')}
            {text(props, 'dental', 'formerDentistContact', "Former dentist's contact number (optional)", { type: 'tel', inputMode: 'tel' })}
            {text(props, 'dental', 'formerDentistAddress', "Former dentist's address (optional)")}
            {text(props, 'dental', 'lastDentalCare', 'Date of last dental care (optional)', { type: 'date' })}
            <Checklist id="dental.symptoms" legend="Tick any you have or had" items={SYMPTOMS} selected={form.dental.symptoms} onChange={(k) => set('dental', 'symptoms', k)} error={errors['dental.symptoms']} />
            {text(props, 'dental', 'brushFrequency', 'How often do you brush?')}
            {text(props, 'dental', 'flossFrequency', 'How often do you floss?')}
        </div>
    );
}

export function ConsentStep({ form, errors, onConsent }: { form: Form; errors: Errors; onConsent: (v: boolean) => void }) {
    const who = isMinor(form) ? 'the Guardian' : 'the Patient';
    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-sm">
                <h3 className="font-bold">Declaration</h3>
                <p>
                    The above information is accurate and complete to the best of my knowledge. I will not hold my present dentist and her dental
                    staff responsible for any errors or omissions that I may have made in the completion of this form.
                </p>
            </section>
            <section className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-sm">
                <h3 className="font-bold">Data Privacy Act notice</h3>
                <p>
                    The clinic collects this information to treat the Patient and keep their records, as allowed by the Data Privacy Act of 2012
                    (Republic Act 10173). It is kept in the clinic's own records, seen only by the clinic's staff, and never sold or shared without
                    consent unless the law requires it. You may ask to see or correct it at any time.
                </p>
            </section>
            <label className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-lg bg-card p-4 shadow-sm ${errors.consent ? 'border-2 border-destructive' : ''}`}>
                <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => onConsent(e.target.checked)}
                    aria-describedby={errors.consent ? 'consent-error' : undefined}
                    className="mt-0.5 size-6 shrink-0 accent-signal"
                />
                <span className="font-bold">
                    I agree that the above is true, and I consent to the clinic keeping this information. ({who} is giving consent.)
                </span>
            </label>
            {errors.consent && (
                <p id="consent-error" className="text-sm text-destructive">
                    {errors.consent}
                </p>
            )}
        </div>
    );
}

function Row({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex flex-col border-b px-4 py-2 last:border-b-0">
            <dt className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{label}</dt>
            <dd className={value ? '' : 'text-muted-foreground'}>{value || 'None'}</dd>
        </div>
    );
}

const list = (keys: string[], all: typeof CONDITIONS) => keys.map((k) => labelOf(all, k)).join(', ');
const yn = (v: boolean | null) => (v === null ? '' : v ? 'Yes' : 'No');

export function ReviewStep({ form, goTo }: { form: Form; goTo: (step: 'personal' | 'guardian' | 'medical' | 'conditions' | 'dental' | 'consent') => void }) {
    const { personal: p, medical: m, dental: d, guardian: g } = form;
    const block = (title: string, step: Parameters<typeof goTo>[0], rows: [string, string | null | undefined][]) => (
        <section className="overflow-hidden rounded-lg bg-card shadow-sm" aria-label={title}>
            <div className="flex items-center justify-between px-4 pt-3">
                <h3 className="font-bold">{title}</h3>
                <button type="button" onClick={() => goTo(step)} className="h-11 px-2 font-bold text-signal">
                    Edit<span className="sr-only"> {title}</span>
                </button>
            </div>
            <dl>
                {rows.map(([label, value]) => (
                    <Row key={label} label={label} value={value} />
                ))}
            </dl>
        </section>
    );
    return (
        <div className="flex flex-col gap-4">
            {block('Personal details', 'personal', [
                ['Full name', p.fullName],
                ['Previous surname', p.previousSurname],
                ['Birthdate', p.birthdate && `${formatDate(p.birthdate)} (${ageOf(p.birthdate)} years old)`],
                ['Sex', p.sex && (p.sex === 'female' ? 'Female' : 'Male')],
                ['Occupation', p.occupation],
                ['Mobile phone', p.mobilePhone],
                ['Landline', p.landline],
                ['Email', p.email],
                ['Address', p.address],
                ['Emergency contact', `${p.emergencyContactName} ${p.emergencyContactPhone}`.trim()],
                ['Brief patient history', p.patientHistory],
            ])}
            {isMinor(form) && block('Guardian', 'guardian', [['Name', g.name], ['Relationship', g.relationship], ['Phone', g.phone]])}
            {block('Medical History', 'medical', [
                ['Serious illness or operation', m.seriousIllness ? `Yes: ${m.seriousIllnessDetails}` : yn(m.seriousIllness)],
                ['Blood transfusion', m.bloodTransfusion ? `Yes${m.transfusionDates ? `: ${m.transfusionDates}` : ''}` : yn(m.bloodTransfusion)],
                ...(p.sex === 'female'
                    ? ([['Pregnant', yn(m.pregnant)], ['Nursing', yn(m.nursing)], ['Birth control pills', yn(m.birthControl)]] as [string, string][])
                    : []),
                ['Medications', m.medications],
                ['Allergies', [list(m.allergies, ALLERGIES), m.allergiesOther].filter(Boolean).join(', ')],
            ])}
            {block('Conditions', 'conditions', [['Ticked', list(m.conditions, CONDITIONS)]])}
            {block('Dental History', 'dental', [
                ['Reason for visit', d.visitReason],
                ['Former dentist', [d.formerDentistName, d.formerDentistContact, d.formerDentistAddress].filter(Boolean).join(' · ')],
                ['Last dental care', d.lastDentalCare && formatDate(d.lastDentalCare)],
                ['Symptoms', list(d.symptoms, SYMPTOMS)],
                ['Brushing', d.brushFrequency],
                ['Flossing', d.flossFrequency],
            ])}
            {block('Consent', 'consent', [['Consent given', form.consent ? 'Yes' : 'No']])}
        </div>
    );
}
