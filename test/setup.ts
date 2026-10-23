import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';

// Runs before each test file. Creates the tables in this file's local D1 by replaying
// drizzle/*.sql, so tests see the same schema production gets from `wrangler d1 migrations apply`.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// the Workers Vitest plugin does not roll D1 back between tests here, so we
// empty every table before each one. Tests never see rows left by an earlier test.
beforeEach(async () => {
    const { results } = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
    ).all<{ name: string }>();
    await env.DB.batch(results.map(({ name }) => env.DB.prepare(`DELETE FROM "${name}"`)));
});
