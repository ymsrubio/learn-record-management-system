import { Hono } from 'hono';
import { patientsRoutes } from './routes/patients';

// One Hono app holds every API route. Cloudflare calls `app.fetch(request)` for each
// request, and the app returns a Response. There is no server and no app.listen().
const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', async (c) => {
    return c.json({ ok: true });
});

app.route('/api/patients', patientsRoutes);

export default app;
