import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { meQuery, signIn, type SignInResult } from '@/lib/auth';

const MESSAGES: Record<Exclude<SignInResult, 'ok'>, string> = {
    // One message for a wrong email and a wrong password. It never says which.
    rejected: 'Email or password is incorrect. Check both and try again.',
    unreachable: "Can't reach the server. Check your connection and try again.",
};

// Phone: a dark brand header with the form on a white sheet. From 768px: brand panel left,
// form right (docs/design-brief.md section 1, canvas signin-phone / signin-desktop).
export function SignIn() {
    const queryClient = useQueryClient();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState<Exclude<SignInResult, 'ok'> | null>(null);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setFailure(null);
        const result = await signIn(email, password);
        if (result === 'ok') {
            // Re-ask "who am I?". The cookie is set now, so App renders the shell instead of this screen.
            await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
            return;
        }
        setFailure(result);
        setSubmitting(false);
    }

    const inputClass = 'h-12 w-full min-w-0 rounded-md border bg-card px-3.5 text-base';
    const border = failure === 'rejected' ? 'border-2 border-destructive' : 'border-input';

    return (
        <div className="flex min-h-dvh flex-col bg-primary md:flex-row md:bg-[#eef2fe] md:p-4">
            <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden md:rounded-[32px] md:bg-card md:shadow-md">
                <section
                    aria-label="ProSmile Dental Clinic"
                    className="relative flex h-[300px] shrink-0 flex-col justify-between overflow-hidden bg-primary px-6 pb-8 pt-14 md:h-auto md:w-[520px] md:p-12"
                >
                    <span aria-hidden className="absolute -left-16 -top-14 size-52 rounded-full bg-[#1b2649]" />
                    <span aria-hidden className="absolute left-56 -top-20 size-60 rounded-full bg-[#c9d5fb]/20" />
                    <span aria-hidden className="absolute left-60 top-10 size-36 rounded-full bg-signal/55" />
                    <div className="relative flex items-center gap-3">
                        <span className="text-lg font-bold leading-6 text-white">
                            ProSmile
                            <span className="block text-[13px] font-medium leading-[18px] text-[#c9d5fb]">Dental Clinic</span>
                        </span>
                    </div>
                    <div className="relative flex max-w-[230px] flex-col gap-3 md:max-w-none">
                        <p className="text-[15px] font-medium leading-[22px] text-[#eef2fe] md:text-[32px] md:font-bold md:leading-10 md:tracking-tight md:text-white">
                            Patient records and today's appointments, in one place.
                        </p>
                    </div>
                </section>

                <main className="relative -mt-6 flex flex-1 flex-col rounded-t-[24px] bg-card px-6 pb-7 pt-8 md:mt-0 md:items-center md:justify-center md:rounded-none md:p-12">
                    <div className="flex w-full max-w-[400px] flex-1 flex-col md:flex-none">
                        <h1 className="text-[28px] font-bold leading-[34px] tracking-tight text-primary md:text-[32px] md:leading-10">
                            Welcome back
                        </h1>
                        <p className="mb-6 mt-1.5 text-[15px] leading-[22px] text-muted-foreground">
                            Sign in to see today's patients.
                        </p>

                        <form onSubmit={onSubmit} className="flex flex-col gap-4">
                            {failure && (
                                <div
                                    id="sign-in-error"
                                    role="alert"
                                    className="flex items-start gap-2 rounded-md bg-danger-soft px-3.5 py-3 text-sm font-semibold leading-5 text-destructive"
                                >
                                    <CircleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden />
                                    <span>{MESSAGES[failure]}</span>
                                </div>
                            )}
                            <div className="flex flex-col gap-2">
                                <label htmlFor="email" className="text-sm font-semibold leading-5">
                                    Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={`${inputClass} ${border}`}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label htmlFor="password" className="text-sm font-semibold leading-5">
                                    Password
                                </label>
                                <div className="relative flex">
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        aria-invalid={failure === 'rejected' || undefined}
                                        aria-describedby={failure ? 'sign-in-error' : undefined}
                                        className={`${inputClass} pr-[52px] ${border}`}
                                    />
                                    <button
                                        type="button"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        onClick={() => setShowPassword((shown) => !shown)}
                                        className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                                    >
                                        {showPassword ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
                                    </button>
                                </div>
                            </div>
                            <Button type="submit" disabled={submitting} aria-busy={submitting} className="mt-2 h-12 text-base font-bold">
                                {submitting ? (
                                    <>
                                        <Loader2 className="animate-spin" aria-hidden />
                                        Signing in…
                                    </>
                                ) : (
                                    'Sign in'
                                )}
                            </Button>
                        </form>

                        <div className="flex-1 md:hidden" />
                        <p className="mt-6 flex items-center justify-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
                            <Lock className="size-4" aria-hidden />
                            Accounts are set up by the clinic.
                        </p>
                    </div>
                </main>
            </div>
        </div>
    );
}
