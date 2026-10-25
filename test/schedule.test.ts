import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import { request } from './helpers/request';
import { signInAsDentist } from './helpers/dentist';

describe('Working Hours for the Schedule', () => {
    it('lists seven days, Sunday closed and Monday to Saturday open in two periods', async () => {
        const session = await signInAsDentist(app);
        const res = await request('/api/schedule/working-hours', session);
        const { days } = (await res.json()) as any;

        expect(res.status).toBe(200);
        expect(days).toHaveLength(7);
        expect(days[0]).toEqual({ weekday: 0, periods: [] });
        expect(days[1]).toEqual({
            weekday: 1,
            periods: [
                { open: 480, close: 720 },
                { open: 780, close: 1020 },
            ],
        });
        expect(days[6].periods).toHaveLength(2);
    });

    it('needs a signed-in User', async () => {
        const res = await request('/api/schedule/working-hours');
        expect(res.status).toBe(401);
    });
});
