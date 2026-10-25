import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { patientSearchQuery } from '@/lib/queries';
import { useDebounced } from '@/lib/useDebounced';

export type PickedPatient = { id: string; fullName: string };

// A search box over GET /api/patients/search, the same ranked search as the Patients screen.
export function PatientPicker({
    value,
    onChange,
    onAddNew,
    error,
}: {
    value: PickedPatient | null;
    onChange: (patient: PickedPatient | null) => void;
    onAddNew?: () => void;
    error?: string;
}) {
    const [text, setText] = useState('');
    const typed = text.trim();
    const q = useDebounced(typed);
    const { data, isFetching, isError } = useQuery({ ...patientSearchQuery(q, false), enabled: q !== '' });

    if (value) {
        return (
            <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold leading-5">Patient</span>
                <div className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-input bg-card pl-3">
                    <span className="truncate font-bold">{value.fullName}</span>
                    <button
                        type="button"
                        aria-label="Change patient"
                        onClick={() => onChange(null)}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-accent"
                    >
                        <X className="size-5" aria-hidden />
                    </button>
                </div>
            </div>
        );
    }

    const matches = (data ?? []).slice(0, 6);

    return (
        <div className="flex flex-col gap-2">
            <label htmlFor="patient-search" className="text-sm font-semibold leading-5">
                Patient
            </label>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                    id="patient-search"
                    type="search"
                    autoComplete="off"
                    placeholder="Search by name or phone"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    className={`h-12 w-full rounded-md border bg-card pl-10 pr-3 text-base ${error ? 'border-2 border-destructive' : 'border-input'}`}
                />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {isError && <p className="text-sm text-destructive">Couldn't load patients.</p>}
            {typed && data && q === typed && !isFetching && matches.length === 0 && (
                <p className="text-sm text-muted-foreground">No patient matches “{typed}”.</p>
            )}
            {typed && (
                <ul className="flex flex-col overflow-hidden rounded-lg bg-card shadow-sm">
                    {matches.map((p) => (
                        <li key={p.id} className="border-b last:border-b-0">
                            <button
                                type="button"
                                onClick={() => onChange({ id: p.id, fullName: p.fullName })}
                                className="flex min-h-12 w-full flex-col items-start justify-center px-4 py-2 text-left hover:bg-accent"
                            >
                                <span className="font-bold">{p.fullName}</span>
                                {p.mobilePhone && <span className="text-sm text-muted-foreground">{p.mobilePhone}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {onAddNew && (
                <Button type="button" variant="secondary" className="h-12" onClick={onAddNew}>
                    <UserPlus aria-hidden />
                    Add new patient
                </Button>
            )}
        </div>
    );
}
