import { Hono } from 'hono';
import type { AppEnv } from '../clock';
import { getDb } from '../db/client';
import { DUPLICATE_LIMIT, SEARCH_LIMIT, parseSearchQuery, recentPatients, searchPatients } from '../patients/search';

const RECENT_LIMIT = 10;

// Mounted before patientsRoutes in worker/index.ts: '/api/patients/search' would otherwise be
// read as the id in GET /api/patients/:id.
export const patientSearchRoutes = new Hono<AppEnv>()
    .get('/search', async (c) => {
        const query = parseSearchQuery(c.req.query('q') ?? '');
        const includeArchived = c.req.query('includeArchived') === 'true';
        const results = await searchPatients(
            getDb(c.env),
            query,
            { includeArchived, limit: SEARCH_LIMIT, combine: 'all' },
            c.var.clock.now(),
            c.var.clock.today(),
        );
        return c.json({ results });
    })
    .get('/recent', async (c) => {
        const results = await recentPatients(getDb(c.env), c.var.user.id, RECENT_LIMIT, c.var.clock.now(), c.var.clock.today());
        return c.json({ results });
    })
    // Quick add asks while the name or phone is typed. Archived Patients count: a returning
    // Patient who was Archived should be restored, not entered twice.
    .get('/duplicates', async (c) => {
        const query = parseSearchQuery(`${c.req.query('name') ?? ''} ${c.req.query('phone') ?? ''}`);
        const results = await searchPatients(
            getDb(c.env),
            query,
            { includeArchived: true, limit: DUPLICATE_LIMIT, combine: 'any' },
            c.var.clock.now(),
            c.var.clock.today(),
        );
        return c.json({ results });
    });
