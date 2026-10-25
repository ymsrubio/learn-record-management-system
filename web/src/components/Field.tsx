import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type FieldProps = Omit<ComponentProps<'input'>, 'id'> & { id: string; label: string; error?: string };

// A labelled input with its error message next to it (docs/design-brief.md: labels are never
// placeholder-only).
export function Field({ id, label, error, className, ...input }: FieldProps) {
    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={id} className="text-sm font-semibold leading-5">
                {label}
            </label>
            <input
                id={id}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={cn(
                    'h-12 w-full min-w-0 rounded-md border bg-card px-3 text-base placeholder:text-[#6b7385]',
                    error ? 'border-2 border-destructive' : 'border-input',
                    className,
                )}
                {...input}
            />
            {error && (
                <p id={`${id}-error`} className="text-sm text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}
