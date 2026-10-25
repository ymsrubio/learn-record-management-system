import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import { PUBLIC_API_ROUTES, requireSession } from '../worker/auth/session';
import { auditOnCreate, auditOnUpdate } from '../worker/db/audit';
import { clockMiddleware, type AppEnv } from '../worker/clock';
import * as schema from '../worker/db/schema';
import { request, at } from './helpers/request';
import { seedDentist, signInAsDentist, signInRequest, TEST_DENTIST } from './helpers/dentist';

describe('sign in', () => {
    it('signs in a seeded Dentist and sets a long-lived, script-proof session cookie', async () => {
        await seedDentist();
        const res = await request('/api/auth/sign-in/email', signInRequest(TEST_DENTIST.email, TEST_DENTIST.password));
        expect(res.status).toBe(200);
        const cookie = res.headers.getSetCookie().find((c) => c.startsWith('better-auth.session_token='))!;
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(cookie).toMatch(/Max-Age=2592000/);
    });

    it('keeps the Dentist signed in on later requests and names them', async () => {
        const session = await signInAsDentist(app);
        const res = await request('/api/me', session);
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            name: 'Maria Santos',
            email: TEST_DENTIST.email,
            role: 'dentist',
        });
    });

    it('gives the same answer for a wrong email and a wrong password', async () => {
        await seedDentist();
        const wrongPassword = await request('/api/auth/sign-in/email', signInRequest(TEST_DENTIST.email, 'not the password'));
        const wrongEmail = await request('/api/auth/sign-in/email', signInRequest('nobody@clinic.test', TEST_DENTIST.password));
        expect(wrongPassword.status).toBe(401);
        expect(wrongEmail.status).toBe(401);
        expect(await wrongEmail.json()).toEqual(await wrongPassword.json());
        expect(wrongPassword.headers.getSetCookie()).toEqual([]);
    });
});

describe('no sign-up', () => {
    it('has no sign-up route, signed in or not, and creates no user', async () => {
        const session = await signInAsDentist(app);
        const body = JSON.stringify({ email: 'new@clinic.test', password: 'a long enough password', name: 'New' });
        const init = { method: 'POST', body, headers: { 'content-type': 'application/json', origin: 'http://localhost' } };

        const signedOut = await request('/api/auth/sign-up/email', init);
        const signedIn = await request('/api/auth/sign-up/email', {
            ...init,
            headers: { ...init.headers, ...session.headers },
        });

        expect(signedOut.status).toBe(401);
        expect(signedIn.status).toBe(404);
        const users = await drizzle(env.DB, { schema }).select().from(schema.user);
        expect(users.map((u) => u.email)).toEqual([TEST_DENTIST.email]);
    });
});

describe('protected API', () => {
    it('refuses a request with no session on every /api route except the public ones', async () => {
        const routes = app.routes
            .filter((r) => r.method !== 'ALL' && !r.path.includes('*'))
            .map((r) => ({ method: r.method, path: r.path.replace(/:\w+/g, 'x') }))
            .filter((r) => !PUBLIC_API_ROUTES.has(`${r.method} ${r.path}`));

        expect(routes.length).toBeGreaterThan(0);
        for (const { method, path } of routes) {
            const res = await request(path, { method });
            expect(res.status, `${method} ${path}`).toBe(401);
        }
    });

    it('refuses a path no route handles, so a typo cannot probe for what exists', async () => {
        expect((await request('/api/nope')).status).toBe(401);
    });

    it('refuses a forged session cookie', async () => {
        const res = await request('/api/patients', { headers: { cookie: 'better-auth.session_token=forged.value' } });
        expect(res.status).toBe(401);
    });
});

describe('sign out', () => {
    it('ends the session: the same cookie is refused afterwards', async () => {
        const session = await signInAsDentist(app);
        expect((await request('/api/patients', session)).status).toBe(200);

        const out = await request('/api/auth/sign-out', {
            method: 'POST',
            headers: { ...session.headers, origin: 'http://localhost', 'content-type': 'application/json' },
            body: '{}',
        });
        expect(out.status).toBe(200);

        expect((await request('/api/patients', session)).status).toBe(401);
    });
});

describe('audit columns', () => {
    // No write route exists yet, so this mounts the real session gate and the audit helpers on a
    // throwaway app and drives it over HTTP with a real sign-in.
    const writes = new Hono<AppEnv>()
        .use('/api/*', clockMiddleware)
        .use('/api/*', requireSession)
        .post('/api/patients', async (c) => {
            const db = drizzle(c.env.DB, { schema });
            await db.insert(schema.patients).values({ id: 'p1', fullName: 'Ana Cruz', ...auditOnCreate(c) });
            return c.json({ ok: true });
        })
        .patch('/api/patients/p1', async (c) => {
            const db = drizzle(c.env.DB, { schema });
            await db.update(schema.patients).set({ fullName: 'Ana Reyes', ...auditOnUpdate(c) });
            return c.json({ ok: true });
        });

    it('records the signed-in user and the clock time on create and update', async () => {
        const session = await signInAsDentist(app);
        const dentist = (await drizzle(env.DB, { schema }).select().from(schema.user))[0]!;
        const call = (method: string, path: string, when: string) =>
            writes.request(path, { method, ...at(when, session.headers) }, env);

        expect((await call('POST', '/api/patients', '2026-10-14T01:00:00Z')).status).toBe(200);
        expect((await call('PATCH', '/api/patients/p1', '2026-10-15T01:00:00Z')).status).toBe(200);

        const [row] = await drizzle(env.DB, { schema }).select().from(schema.patients);
        expect(row).toMatchObject({
            createdBy: dentist.id,
            updatedBy: dentist.id,
            createdAt: new Date('2026-10-14T01:00:00Z'),
            updatedAt: new Date('2026-10-15T01:00:00Z'),
        });
    });

    it('refuses the write and stores nothing when nobody is signed in', async () => {
        expect((await writes.request('/api/patients', { method: 'POST' }, env)).status).toBe(401);
        expect(await drizzle(env.DB, { schema }).select().from(schema.patients)).toEqual([]);
    });
});
