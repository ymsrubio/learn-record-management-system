import { hc } from 'hono/client';
import type { AppType } from '../../../worker';

// Hono RPC: `hc` builds a fetch wrapper whose methods mirror the Worker's routes, typed from
// AppType. `api.api.patients.$get()` sends GET /api/patients, and the response type is
// whatever the route handler returns. Rename a route or field in worker/ and this file
// stops compiling. '/' means "same origin": the Worker that served the page.
export const api = hc<AppType>('/');
