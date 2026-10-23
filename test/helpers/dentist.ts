import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { Hono } from 'hono';
import { dentistRows, type DentistInput } from '../../worker/auth/dentist';
import * as schema from '../../worker/db/schema';

export const TEST_DENTIST: DentistInput = {
    email: 'dr.santos@clinic.test',
    name: 'Maria Santos',
    password: 'correct horse battery staple',
};

// Writes a Dentist straight into D1, the way the seed command does (sign-up has no route).
export async function seedDentist(input: DentistInput = TEST_DENTIST) {
    const { user, account } = await dentistRows(input);
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.user).values({
        ...user,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
    });
    await db.insert(schema.account).values({
        ...account,
        createdAt: new Date(account.createdAt),
        updatedAt: new Date(account.updatedAt),
    });
    return user;
}

export function signInRequest(email: string, password: string): RequestInit {
    return {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ email, password }),
    };
}

// Seeds the test Dentist, signs in through the real /api/auth/sign-in/email, and returns
// request options carrying the session cookie. Spread into any request: request(path, session).
export async function signInAsDentist(app: Hono<any>): Promise<{ headers: Record<string, string> }> {
    await seedDentist();
    const res = await app.request(
        '/api/auth/sign-in/email',
        signInRequest(TEST_DENTIST.email, TEST_DENTIST.password),
        env,
    );
    if (res.status !== 200) throw new Error(`test sign-in failed: ${res.status} ${await res.text()}`);
    const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
    return { headers: { cookie } };
}
