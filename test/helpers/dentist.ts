import type { Hono } from 'hono';

// Stub until auth (#3) lands. It will seed a Dentist User and sign in through the real
// sign-in endpoint, then return the session cookie for later requests. Tests call it
// today so they already have the shape they will use once sign-in exists.
export async function signInAsDentist(_app: Hono<any>): Promise<{ headers: Record<string, string> }> {
    return { headers: {} };
}
