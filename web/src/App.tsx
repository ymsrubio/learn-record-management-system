import { Route, Routes } from 'react-router';
import { AppShell } from '@/components/AppShell';
import { Dashboard } from '@/screens/Dashboard';
import { Patients } from '@/screens/Patients';
import { Schedule } from '@/screens/Schedule';
import { NotFound } from '@/screens/NotFound';

export function App() {
    return (
        <Routes>
            <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="patients" element={<Patients />} />
                <Route path="schedule" element={<Schedule />} />
                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    );
}
