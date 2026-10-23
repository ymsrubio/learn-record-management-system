import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

export type SignedInUser = { id: string; name: string; email: string; role: string };

// Who is signed in? The browser sends the session cookie by itself; the Worker answers 401 when
// there is none. That is an expected answer, not an error, so it becomes `null`.
export const meQuery = queryOptions({
    queryKey: ['me'],
    queryFn: async (): Promise<SignedInUser | null> => {
        const res = await api.api.me.$get();
        if (res.status === 401) return null;
        if (!res.ok) throw new Error(`GET /api/me failed with ${res.status}`);
        return res.json();
    },
    retry: false,
    staleTime: Infinity,
});

export type SignInResult = 'ok' | 'rejected' | 'unreachable';

// Better Auth's sign-in endpoint. On success its response carries Set-Cookie, which the browser
// stores. Every failure status is one answer on purpose ("rejected"), so the screen cannot say
// which half was wrong.
export async function signIn(email: string, password: string): Promise<SignInResult> {
    try {
        const res = await fetch('/api/auth/sign-in/email', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        return res.ok ? 'ok' : 'rejected';
    } catch {
        return 'unreachable';
    }
}

export async function signOut(): Promise<void> {
    await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
    });
}

// "Maria Santos" -> "Dr. Santos". The surname is the last word of the name given at seed time.
export function doctorName(fullName: string): string {
    const words = fullName.trim().split(/\s+/);
    return `Dr. ${words[words.length - 1]}`;
}
