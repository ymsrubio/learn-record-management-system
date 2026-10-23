import { Hono } from 'hono';
import { patientsRoutes } from './routes/patients';

// One Hono app holds every API route. Cloudflare calls `app.fetch(request)` for each
// request, and the app returns a Response. There is no server and no app.listen().
const app = new Hono<{ Bindings: Env }>();

// Routes are chained (not called on `app` one by one) so TypeScript can capture every route's
// shape in `routes`. The front-end's Hono RPC client reads that type through `AppType`.
const routes = app
    .get('/api/health', async (c) => {
        return c.json({ ok: true });
    })
    .route('/api/patients', patientsRoutes);

export type AppType = typeof routes;

export default app;
