import { useState, type ComponentProps } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Choice } from '../../../../worker/intake/lists';

function FieldError({ id, error }: { id: string; error?: string }) {
    if (!error) return null;
    return (
        <p id={`${id}-error`} className="text-sm text-destructive">
            {error}
        </p>
    );
}

// A labelled multi-line box. Labels are never placeholder-only (docs/design-brief.md).
export function TextArea({ id, label, error, ...rest }: Omit<ComponentProps<'textarea'>, 'id'> & { id: string; label: string; error?: string }) {
    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={id} className="text-sm font-semibold leading-5">
                {label}
            </label>
            <textarea
                id={id}
                rows={3}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={cn('w-full min-w-0 rounded-md border bg-card px-3 py-3 text-base', error ? 'border-2 border-destructive' : 'border-input')}
                {...rest}
            />
            <FieldError id={id} error={error} />
        </div>
    );
}

type Option<T> = { value: T; label: string };

// Large side-by-side choices for a question with a few answers (yes/no, sex). Exposed to screen readers as a radio group.
export function Choices<T extends string | boolean>({
    id, label, options, value, onChange, error,
}: { id: string; label: string; options: Option<T>[]; value: T | null | ''; onChange: (v: T) => void; error?: string }) {
    return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined} className="flex flex-col gap-2">
            <span id={`${id}-label`} className="text-sm font-semibold leading-5">
                {label}
            </span>
            <div className="grid grid-cols-2 gap-3">
                {options.map((o) => {
                    const on = value === o.value;
                    return (
                        <button
                            key={String(o.value)}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => onChange(o.value)}
                            className={cn(
                                'h-12 rounded-md border text-base font-bold',
                                on ? 'border-signal bg-accent text-signal ring-2 ring-signal' : 'bg-card',
                                error && !on && 'border-2 border-destructive',
                            )}
                        >
                            {o.label}
                        </button>
                    );
                })}
            </div>
            <FieldError id={id} error={error} />
        </div>
    );
}

export const yesNo = [
    { value: true, label: 'Yes' },
    { value: false, label: 'No' },
];

function toggle(list: string[], key: string) {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

// A tick list with 48px rows. `searchable` adds a filter box and a strip of what is already ticked,
// for the 46-item conditions list.
export function Checklist({
    id, legend, items, selected, onChange, searchable, error,
}: { id: string; legend: string; items: Choice[]; selected: string[]; onChange: (keys: string[]) => void; searchable?: boolean; error?: string }) {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const shown = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
    const ticked = items.filter((i) => selected.includes(i.key));

    return (
        <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-semibold leading-5">{legend}</legend>
            {searchable && (
                <>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <input
                            id={`${id}-search`}
                            type="search"
                            aria-label="Search conditions"
                            placeholder="Search conditions"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="h-12 w-full rounded-md border border-input bg-card pl-10 pr-3 text-base"
                        />
                    </div>
                    <div aria-live="polite" className="flex flex-wrap gap-2">
                        {ticked.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nothing ticked yet.</p>
                        ) : (
                            ticked.map((i) => (
                                <button
                                    key={i.key}
                                    type="button"
                                    onClick={() => onChange(toggle(selected, i.key))}
                                    aria-label={`Remove ${i.label}`}
                                    className="inline-flex h-9 items-center gap-1 rounded-full bg-accent pl-3 pr-2 text-sm font-bold text-signal"
                                >
                                    {i.label}
                                    <X className="size-4" aria-hidden />
                                </button>
                            ))
                        )}
                    </div>
                </>
            )}
            <div className="overflow-hidden rounded-lg bg-card shadow-sm">
                {shown.map((i) => (
                    <label key={i.key} className="flex min-h-12 cursor-pointer items-center gap-3 border-b px-4 py-2 last:border-b-0">
                        <input
                            type="checkbox"
                            checked={selected.includes(i.key)}
                            onChange={() => onChange(toggle(selected, i.key))}
                            className="size-6 shrink-0 accent-signal"
                        />
                        <span>{i.label}</span>
                    </label>
                ))}
                {shown.length === 0 && <p className="px-4 py-3 text-muted-foreground">No condition matches "{query}".</p>}
            </div>
            <FieldError id={id} error={error} />
        </fieldset>
    );
}
