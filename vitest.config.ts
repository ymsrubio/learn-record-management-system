import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Reads drizzle/*.sql on the Node side so the Workers-side setup file can apply them.
const migrations = await readD1Migrations(path.join(import.meta.dirname, 'drizzle'));

export default defineConfig({
    plugins: [
        cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
                bindings: {
                    ENVIRONMENT: 'test',
                    BETTER_AUTH_SECRET: 'test-only-secret-test-only-secret-test-only',
                    TEST_MIGRATIONS: migrations,
                },
            },
        }),
    ],
    test: {
        include: ['test/**/*.test.ts'],
        setupFiles: ['./test/setup.ts'],
    },
});
