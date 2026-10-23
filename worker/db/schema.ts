import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Better Auth's tables live in their own generated file; re-exported so drizzle-kit and
// getDb() see one schema.
export * from './auth-schema';

// The patients table, written in TypeScript. Drizzle uses this one definition twice:
//   1. drizzle-kit reads it to generate the CREATE TABLE migration (drizzle/*.sql)
//   2. your queries use it, so TypeScript knows every column and its type
// Later slices add columns (guardian, created_by, ...) with their own migrations.
export const patients = sqliteTable('patients', {
    // Random UUID instead of 1, 2, 3...: patient ids appear in URLs and shouldn't be guessable.
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    fullName: text('full_name').notNull(),
    mobilePhone: text('mobile_phone'),
    // Nullable: quick add saves a patient before the Intake form fills this in.
    birthdate: text('birthdate'), // 'YYYY-MM-DD'
    // null = Pending Intake (see CONTEXT.md).
    intakeCompletedAt: integer('intake_completed_at', { mode: 'timestamp_ms' }),
    // null = active, set = Archived. Nothing is ever deleted.
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    // Audit: the User who created / last changed the row (user.id). Nullable because rows from
    // before sign-in existed have no author. No foreign key, so the audit trail survives
    // even if a User row is ever removed. Fill them with auditOnCreate / auditOnUpdate.
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
});
