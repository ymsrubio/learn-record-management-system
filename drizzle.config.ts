import { defineConfig } from 'drizzle-kit';

// Config for drizzle-kit, the command-line half of Drizzle. It only generates SQL files;
// Wrangler is what applies them to D1 (local or remote).
export default defineConfig({
    dialect: 'sqlite', // D1 is SQLite
    schema: './worker/db/schema.ts',
    out: './drizzle',
});
