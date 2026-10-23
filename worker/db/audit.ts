import type { Context } from 'hono';
import type { AppEnv } from '../clock';

type AuditContext = Context<AppEnv>;

// Audit columns for an INSERT: who created the row and when, from the signed-in User and the
// Clock (never `new Date()`, so tests can fix the time). Spread into `.values({...})`.
export function auditOnCreate(c: AuditContext) {
    const at = c.var.clock.now();
    const by = c.var.user.id;
    return { createdBy: by, updatedBy: by, createdAt: at, updatedAt: at };
}

// Audit columns for an UPDATE. Spread into `.set({...})`.
export function auditOnUpdate(c: AuditContext) {
    return { updatedBy: c.var.user.id, updatedAt: c.var.clock.now() };
}
