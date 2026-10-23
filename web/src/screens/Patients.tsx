import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { patientsQuery } from '@/lib/queries';

// Placeholder: proves the typed client + TanStack Query path end to end. Real search
// (partial words, phone, guardian) arrives with the Patients slice.
export function Patients() {
    const { data, error, isPending, refetch } = useQuery(patientsQuery);
    const [text, setText] = useState('');
    const matches = data?.filter((p) => p.fullName.toLowerCase().includes(text.trim().toLowerCase()));

    return (
        <>
            <h1 className="text-[28px] font-bold leading-[34px] tracking-tight">Patients</h1>
            <div className="mt-4 flex h-12 items-center gap-3 rounded-full bg-card px-4 shadow-sm">
                <Search className="size-5 text-muted-foreground" aria-hidden />
                <input
                    autoFocus
                    type="search"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Search by name or phone"
                    aria-label="Search patients"
                    className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#6b7385]"
                />
            </div>

            <div className="mt-4" aria-live="polite">
                {isPending && <p className="text-muted-foreground">Loading patients…</p>}
                {error && (
                    <div className="rounded-lg bg-[var(--danger-soft)] p-4 text-destructive">
                        <p className="font-semibold">Couldn't load patients.</p>
                        <Button variant="secondary" className="mt-3" onClick={() => refetch()}>
                            Try again
                        </Button>
                    </div>
                )}
                {matches && matches.length === 0 && (
                    <p className="text-muted-foreground">
                        {data?.length === 0 ? 'No patients yet.' : `No patient matches "${text}".`}
                    </p>
                )}
                {matches && matches.length > 0 && (
                    <ul className="flex flex-col gap-3">
                        {matches.map((p) => (
                            <li key={p.id} className="rounded-lg bg-card p-4 shadow-sm">
                                <p className="font-bold">{p.fullName}</p>
                                {p.mobilePhone && <p className="text-sm text-muted-foreground">{p.mobilePhone}</p>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}
