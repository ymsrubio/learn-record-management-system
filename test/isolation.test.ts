import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { request } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';
import app from '../worker/index';

// Harness check, not a feature test: it writes to D1 directly because no write route exists yet.
describe('per-test storage isolation', () => {
    it('sees a patient written in this test', async () => {
        await env.DB.prepare(
            "INSERT INTO patients (id, full_name, created_at, updated_at) VALUES ('p1', 'Ana Cruz', 0, 0)",
        ).run();
        const res = await request('/api/patients', await signInAsDentist(app));
        expect(await res.json()).toHaveLength(1);
    });

    it('does not see the previous test’s patient', async () => {
        const res = await request('/api/patients', await signInAsDentist(app));
        expect(await res.json()).toEqual([]);
    });
});
