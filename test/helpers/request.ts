import { env } from 'cloudflare:workers';
import app from '../../worker/index';

// Calls the Hono app in-process, the same way Cloudflare does for a real request:
// app.request(path, init, env) -> Response. `env` carries the test D1 and bindings.
export function request(path: string, init: RequestInit = {}, envOverride: Partial<Env> = {}) {
    return app.request(path, init, { ...env, ...envOverride });
}

// Fixes the Clock's "now" for one request through the test-only time hook.
export function at(isoInstant: string, headers: Record<string, string> = {}) {
    return { headers: { 'X-Test-Now': isoInstant, ...headers } };
}
