import { Hono } from 'hono';

// One Hono app holds every API route. Cloudflare calls `app.fetch(request)` for each
// request, and the app returns a Response. There is no server and no app.listen().
const app = new Hono();

app.get('/api/health', async (c) => {
    return c.json({ ok: true });
});

export default app;
