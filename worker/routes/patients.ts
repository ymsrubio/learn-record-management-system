import { Hono } from 'hono';
import { getDb } from '../db/client';
import { patients } from '../db/schema';

// A sub-app for everything under /api/patients. worker/index.ts mounts it with
// app.route('/api/patients', patientsRoutes), so '/' here means /api/patients.
// `Bindings: Env` tells TypeScript what's on c.env (here: c.env.DB).
export const patientsRoutes = new Hono<{ Bindings: Env }>();


patientsRoutes.get('/', async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(patients);
    return c.json(rows);
});
