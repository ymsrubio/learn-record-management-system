import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PatientRow } from '@/components/PatientRow';
import { patientSearchQuery, recentPatientsQuery } from '@/lib/queries';
import { useDebounced } from '@/lib/useDebounced';

// docs/design-brief.md section 3. Before typing: recently seen Patients. While typing: results
// from GET /api/patients/search, which the server ranks and caps at 25.
export function Patients() {
    const [text, setText] = useState('');
    const [includeArchived, setIncludeArchived] = useState(false);
    const typed = text.trim();
    const q = useDebounced(typed);

    const recent = useQuery(recentPatientsQuery);
    const search = useQuery({ ...patientSearchQuery(q, includeArchived), enabled: q !== '' });
    const searching = typed !== '';
    // Between a keystroke and its debounced request, the old results stay up; "No patient
    // matches" only shows once the answer for the text on screen has arrived.
    const settled = q === typed && !search.isFetching;

    const list = searching ? search : recent;
    const rows = searching ? search.data : recent.data;

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

            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
                <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(e) => setIncludeArchived(e.target.checked)}
                    className="size-5 accent-signal"
                />
                <span className="text-sm font-semibold">Include archived</span>
            </label>

            <Button asChild className="mt-2 h-12 w-full text-base font-bold md:w-auto">
                <Link to={typed ? `/patients/new?name=${encodeURIComponent(typed)}` : '/patients/new'}>
                    <Plus aria-hidden />
                    Add patient
                </Link>
            </Button>

            <div className="mt-4" aria-live="polite">
                {!searching && rows && rows.length > 0 && (
                    <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Recently seen</h2>
                )}
                {list.isPending && list.fetchStatus !== 'idle' && <p className="text-muted-foreground">Loading patients…</p>}
                {list.isError && (
                    <div className="rounded-lg bg-[var(--danger-soft)] p-4 text-destructive">
                        <p className="font-semibold">Couldn't load patients.</p>
                        <Button variant="secondary" className="mt-3" onClick={() => list.refetch()}>
                            Try again
                        </Button>
                    </div>
                )}
                {!searching && rows?.length === 0 && (
                    <p className="text-muted-foreground">Search by name, phone, a Guardian's phone or a previous surname.</p>
                )}
                {searching && rows?.length === 0 && settled && (
                    <p className="text-muted-foreground">No patient matches "{typed}".</p>
                )}
                {rows && rows.length > 0 && (
                    <ul className="flex flex-col gap-3">
                        {rows.map((p) => (
                            <li key={p.id}>
                                <PatientRow patient={p} />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}
