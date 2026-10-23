import { betterAuth } from 'better-auth';
import { drizzle } from 'drizzle-orm/d1';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import * as schema from '../db/schema';

const DAY = 60 * 60 * 24;

// Builds the Better Auth instance for one request. Workers hand us `env` per request (there is
// no module-level connection), so the instance is created from it each time. Cheap: it only
// wires config, no I/O.
export function createAuth(env: Env) {
    // A second Drizzle client on purpose: worker/db/client.ts logs every statement, and Better
    // Auth's statements carry password hashes and session tokens, which must not reach the logs.
    const db = drizzle(env.DB, { schema });

    return betterAuth({
        database: drizzleAdapter(db, { provider: 'sqlite', schema }),
        secret: env.BETTER_AUTH_SECRET,
        emailAndPassword: {
            enabled: true,
            // The Dentist account is created by the seed command, never through the app.
            disableSignUp: true,
        },
        session: {
            // Stay signed in on the phone: 30 days, and any use after a day pushes the expiry out.
            expiresIn: 30 * DAY,
            updateAge: DAY,
        },
        user: {
            additionalFields: {
                // CONTEXT.md: every User has exactly one Role; Dentist is the only one for now.
                // input: false means a client can never set it.
                role: { type: 'string', required: false, defaultValue: 'dentist', input: false },
            },
        },
    });
}

export type Auth = ReturnType<typeof createAuth>;
