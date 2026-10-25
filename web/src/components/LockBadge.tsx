import { Lock } from 'lucide-react';

export function LockBadge() {
    return (
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground ring-1 ring-border">
            <Lock className="size-3.5" aria-hidden />
            Locked
        </span>
    );
}
