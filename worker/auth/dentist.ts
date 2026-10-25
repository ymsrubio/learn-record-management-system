import { hashPassword } from 'better-auth/crypto';

export type DentistInput = { email: string; name: string; password: string };

// The two rows Better Auth keeps for an email-and-password User: who they are (`user`) and how
// they prove it (`account`, with the scrypt hash of the password). Used by the seed script and
// the test helper, so both create exactly what a real sign-in expects.
export async function dentistRows({ email, name, password }: DentistInput) {
    const id = crypto.randomUUID();
    const now = Date.now();
    return {
        user: { id, name, email: email.trim().toLowerCase(), role: 'dentist', createdAt: now, updatedAt: now },
        account: {
            id: crypto.randomUUID(),
            accountId: id,
            providerId: 'credential',
            userId: id,
            password: await hashPassword(password),
            createdAt: now,
            updatedAt: now,
        },
    };
}
