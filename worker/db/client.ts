import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

// Wraps the raw D1 binding (env.DB) in Drizzle, so queries are written in TypeScript
// and typed from schema.ts. `logger: true` prints every SQL statement Drizzle sends to
// the terminal running `npm run dev`, so you can see the query under the TypeScript.
export function getDb(env: Env) {
    return drizzle(env.DB, { schema, logger: true });
}
