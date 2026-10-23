import { NavLink, Link, Outlet } from 'react-router';
import { CalendarDays, House, Search, Users, type LucideIcon } from 'lucide-react';
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
            </aside>

            <header className="sticky top-0 z-10 flex items-center justify-between bg-background px-5 pt-[env(safe-area-inset-top)] md:hidden">
                <span className="text-lg font-bold">ProSmile</span>
                <Link
                    to="/patients"
                    aria-label="Search patients"
                    className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-accent"
                >
                    <Search className="size-5" aria-hidden />
                </Link>
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
