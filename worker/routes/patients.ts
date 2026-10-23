import { Hono } from 'hono';
import { getDb } from '../db/client';
import { patients } from '../db/schema';

// A sub-app for everything under /api/patients. worker/index.ts mounts it with
// app.route('/api/patients', patientsRoutes), so '/' here means /api/patients.
// `Bindings: Env` tells TypeScript what's on c.env (here: c.env.DB).
// Handlers are chained onto the constructor (`.get(...)`, not `patientsRoutes.get(...)`) so the
// exported type carries each route's shape for the front-end's RPC client.
export const patientsRoutes = new Hono<{ Bindings: Env }>().get('/', async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(patients);
    return c.json(rows);
});
