import { describe, expect, it } from 'vitest';
import { at, request } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';
import app from '../worker/index';

describe('GET /api/health', () => {
    it('answers ok', async () => {
        const res = await request('/api/health');
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ok: true });
    });

    it('reports the clinic-local date: 23:30 UTC on 14 Oct is already 15 Oct in Manila', async () => {
        const res = await request('/api/health', at('2026-10-14T23:30:00Z'));
        expect(await res.json()).toEqual({ ok: true, today: '2026-10-15' });
    });

    it('still reports the same clinic day one minute before Manila midnight', async () => {
        const res = await request('/api/health', at('2026-10-14T15:59:00Z'));
        expect(await res.json()).toEqual({ ok: true, today: '2026-10-14' });
    });

    it('rolls to the next clinic day at exactly Manila midnight', async () => {
        const res = await request('/api/health', at('2026-10-14T16:00:00Z'));
        expect(await res.json()).toEqual({ ok: true, today: '2026-10-15' });
    });

    it('refuses the test-only time hook outside the test environment', async () => {
        const res = await request('/api/health', at('2026-10-14T16:00:00Z'), { ENVIRONMENT: 'production' });
        expect(res.status).toBe(403);
    });

    it('rejects a time hook value that is not a timestamp', async () => {
        const res = await request('/api/health', at('tomorrow-ish'));
        expect(res.status).toBe(400);
    });
});

describe('GET /api/patients', () => {
    it('starts empty, and a second test sees nothing left over from the first', async () => {
        const session = await signInAsDentist(app);
        const res = await request('/api/patients', session);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([]);
    });
});
