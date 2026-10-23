import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../clock';
import { createAuth } from './auth';

// The only /api routes a request may reach without a session. Everything else is refused.
// Health stays open because deploy checks and `verify.sh doctor` need a probe that works signed out.
export const PUBLIC_API_ROUTES: ReadonlySet<string> = new Set([
    'POST /api/auth/sign-in/email',
    'GET /api/health',
]);

// Runs before every /api route. The browser sends the session cookie automatically; Better Auth
// looks the cookie's token up in the `session` table. No valid session means 401 and the route
// never runs. A new route is protected by default: it has to be added to the list above to be open.
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
    if (PUBLIC_API_ROUTES.has(`${c.req.method} ${c.req.path}`)) return next();

    const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Not signed in' }, 401);

    const { id, name, email, role } = session.user;
    c.set('user', { id, name, email, role: role ?? 'dentist' });
    await next();
});
