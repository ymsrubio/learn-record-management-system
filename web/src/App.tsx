import { useQuery } from '@tanstack/react-query';
import { Route, Routes } from 'react-router';
import { meQuery } from '@/lib/auth';
import { SignIn } from '@/screens/SignIn';
import { AppShell } from '@/components/AppShell';
import { Dashboard } from '@/screens/Dashboard';
import { AppointmentForm } from '@/screens/AppointmentForm';
import { AddPatient } from '@/screens/AddPatient';
import { PatientRecord } from '@/screens/PatientRecord';
import { Patients } from '@/screens/Patients';
import { Schedule } from '@/screens/Schedule';
import { NotFound } from '@/screens/NotFound';

export function App() {
    const me = useQuery(meQuery);

    // Waiting for the first answer to "who am I?" shows nothing, so a signed-in Dentist never
    // sees the sign-in form flash by.
    if (me.isPending) return <div className="min-h-dvh" aria-busy />;
    if (me.isError) return <p role="alert" className="p-6">Couldn't load the app. Reload to try again.</p>;
    if (me.data === null) return <SignIn />;

    return (
        <Routes>
            <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="patients" element={<Patients />} />
                <Route path="patients/new" element={<AddPatient />} />
                <Route path="patients/:id" element={<PatientRecord />} />
                <Route path="appointments/new" element={<AppointmentForm />} />
                <Route path="appointments/:id" element={<AppointmentForm />} />
                <Route path="schedule" element={<Schedule />} />
                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    );
}
