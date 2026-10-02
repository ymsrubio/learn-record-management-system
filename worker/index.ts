import { Hono } from 'hono';

// One Hono app holds every API route. Cloudflare calls `app.fetch(request)` for each
// request, and the app returns a Response. There is no server and no app.listen().
const app = new Hono();

// TODO (you): add a route so that GET /api/health returns the JSON { ok: true }.
// Hints:
//   - Express was  app.get(path, (req, res) => res.json(...))
//   - Hono is      app.get(path, (c) => c.json(...))   — `c` is the "context":
//     it holds the request (c.req) and has helpers to build the response.
//   - In Hono you must `return` the response.

app.get('/api/health', async (c) => {
    return c.json({ ok: true })
})

export default app;
