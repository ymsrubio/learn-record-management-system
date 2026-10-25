import { Hono } from 'hono';
import { type AppEnv, clockMiddleware } from './clock';
import { createAuth } from './auth/auth';
import { requireSession } from './auth/session';
import { appointmentsRoutes } from './routes/appointments';
import { guardiansRoutes, intakeRoutes } from './routes/intake';
import { patientSearchRoutes } from './routes/patient-search';
import { patientsRoutes } from './routes/patients';
import { scheduleRoutes } from './routes/schedule';
import { treatmentNotesRoutes } from './routes/treatment-notes';

// One Hono app holds every API route. Cloudflare calls `app.fetch(request)` for each
// request, and the app returns a Response. There is no server and no app.listen().
const app = new Hono<AppEnv>();

app.use('/api/*', clockMiddleware);
app.use('/api/*', requireSession);

// Routes are chained (not called on `app` one by one) so TypeScript can capture every route's
// shape in `routes`. The front-end's Hono RPC client reads that type through `AppType`.
const routes = app
    .get('/api/health', async (c) => {
        return c.json({ ok: true, today: c.var.clock.today() });
    })
    // Only these two Better Auth endpoints are exposed. Its other endpoints (sign-up, change
    // password, ...) stay unreachable because we never mount them.
    .post('/api/auth/sign-in/email', (c) => createAuth(c.env).handler(c.req.raw))
    .post('/api/auth/sign-out', (c) => createAuth(c.env).handler(c.req.raw))
    .get('/api/me', (c) => {
        const { id, name, email, role } = c.var.user;
        return c.json({ id, name, email, role });
    })
    .route('/api/patients', patientSearchRoutes)
    .route('/api/patients', patientsRoutes)
    .route('/api/patients', intakeRoutes)
    .route('/api/guardians', guardiansRoutes)
    .route('/api/appointments', appointmentsRoutes)
    .route('/api/appointments', treatmentNotesRoutes)
    .route('/api/schedule', scheduleRoutes);

export type AppType = typeof routes;

export default app;
