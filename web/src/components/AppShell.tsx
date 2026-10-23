import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Link, Outlet } from 'react-router';
import { CalendarDays, House, LogOut, Search, UserRound, Users, type LucideIcon } from 'lucide-react';
import { doctorName, meQuery, signOut } from '@/lib/auth';
import { cn } from '@/lib/utils';

const navItems: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
    { to: '/', label: 'Dashboard', icon: House, end: true },
    { to: '/patients', label: 'Patients', icon: Users },
    { to: '/schedule', label: 'Schedule', icon: CalendarDays },
];

// One layout for every screen: bottom nav below 768px (the phone, main device), a
// side nav from 768px up. Screens render into <Outlet />.
export function AppShell() {
    return (
        <div className="min-h-dvh md:pl-64">
            <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 rounded-r-[32px] bg-primary py-7 pl-4 text-primary-foreground md:flex">
                <div className="px-2 text-lg font-bold leading-6">
                    ProSmile
                    <span className="block text-xs font-medium text-[#c9d5fb]">Dental Clinic</span>
                </div>
                <SearchLink className="mr-4 bg-white/10 text-[#c9d5fb] hover:bg-white/20" />
                <nav aria-label="Main" className="flex flex-col gap-1.5">
                    {navItems.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                cn(
                                    'flex h-12 items-center gap-3 rounded-l-full px-5 text-[15px] font-medium text-[#c9d5fb]',
                                    isActive && 'bg-background font-bold text-primary',
                                )
                            }
                        >
                            <Icon className="size-5" aria-hidden />
                            {label}
                        </NavLink>
                    ))}
                </nav>
                <div className="mt-auto flex items-center gap-3 pr-4">
                    <UserBlock />
                </div>
            </aside>

            <header className="sticky top-0 z-10 flex items-center justify-between bg-background px-5 pt-[env(safe-area-inset-top)] md:hidden">
                <span className="text-lg font-bold">ProSmile</span>
                <div className="flex items-center">
                    <Link
                        to="/patients"
                        aria-label="Search patients"
                        className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-accent"
                    >
                        <Search className="size-5" aria-hidden />
                    </Link>
                    <PhoneMenu />
                </div>
            </header>

            <main className="mx-auto max-w-[1280px] px-5 pb-28 pt-4 md:px-6 md:pb-8 md:pt-8">
                <Outlet />
            </main>

            <nav
                aria-label="Main"
                className="fixed inset-x-0 bottom-0 z-10 grid h-[76px] grid-cols-3 items-center rounded-t-xl bg-card px-2 pb-2 shadow-nav md:hidden"
            >
                {navItems.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({ isActive }) =>
                            cn(
                                'flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground',
                                isActive && 'font-bold text-signal',
                            )
                        }
                    >
                        <Icon className="size-5" aria-hidden />
                        {label}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}

function SearchLink({ className }: { className?: string }) {
    return (
        <Link
            to="/patients"
            className={cn('flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium', className)}
        >
            <Search className="size-4" aria-hidden />
            Search patients
        </Link>
    );
}

// Signs out: the server ends the session row, then every cached answer except "who am I" is dropped so the next
// person on this device cannot see the last Dentist's data, and App swaps back to the sign-in screen.
function useSignOut() {
    const queryClient = useQueryClient();
    return async () => {
        await signOut();
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQuery.queryKey[0] });
        queryClient.setQueryData(meQuery.queryKey, null);
    };
}

// Sidebar (768px and up): the name and Sign out sit at the bottom of the side nav.
function UserBlock() {
    const me = useQuery(meQuery).data;
    const handleSignOut = useSignOut();
    return (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10">
                <UserRound className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{me ? doctorName(me.name) : ''}</span>
            <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-[#c9d5fb] hover:bg-white/10"
            >
                <LogOut className="size-5" aria-hidden />
            </button>
        </div>
    );
}

// Phone: a menu button in the top bar opens a small panel with the name and Sign out.
function PhoneMenu() {
    const me = useQuery(meQuery).data;
    const handleSignOut = useSignOut();
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button
                type="button"
                aria-label="Account menu"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-accent"
            >
                <UserRound className="size-5" aria-hidden />
            </button>
            {open && (
                <div role="menu" className="absolute right-0 top-12 z-20 w-56 rounded-md bg-card p-2 shadow-md">
                    <p className="px-3 py-2 text-sm font-semibold">{me ? doctorName(me.name) : ''}</p>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-accent"
                    >
                        <LogOut className="size-5" aria-hidden />
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}
