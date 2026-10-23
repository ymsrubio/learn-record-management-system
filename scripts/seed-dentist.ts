// One-off: creates the Dentist account. Run by the maintainer, never by the app.
//
//   npm run seed:dentist -- --local
//   npm run seed:dentist -- --remote --db records-db-preview
//   npm run seed:dentist -- --remote --db records-db          (production, deliberately typed out)
//   npm run seed:dentist -- --local --persist-to <dir>        (a verify run's own database)
//
// Asks for the email, the full name and the password in the terminal, so no password is ever in
// the repo, in shell history or in a command line. It hashes the password here, writes one
// INSERT file with the hash, hands it to `wrangler d1 execute`, then deletes the file.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { dentistRows } from '../worker/auth/dentist.ts';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
if (remote === args.includes('--local')) fail('Pass exactly one of --local or --remote.');
const dbFlag = args.indexOf('--db');
const db = dbFlag >= 0 ? args[dbFlag + 1] : 'DB';
const persistFlag = args.indexOf('--persist-to');
const persistArgs = persistFlag >= 0 ? ['--persist-to', args[persistFlag + 1]] : [];
if (remote && !args[dbFlag + 1]) fail('--remote needs --db <database name>, e.g. --db records-db-preview.');

function fail(message: string): never {
    console.error(message);
    process.exit(1);
}

// Typed passwords must not echo, so everything readline writes goes through a stream that can be muted.
let muted = false;
const output = new Writable({
    write(chunk, encoding, done) {
        if (!muted) process.stdout.write(chunk, encoding);
        done();
    },
});
const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
async function ask(question: string, hidden = false) {
    process.stdout.write(question);
    muted = hidden;
    const answer = await rl.question('');
    muted = false;
    if (hidden) process.stdout.write('\n');
    return answer.trim();
}

// Scripts (such as verify.sh) can skip the prompts by setting SEED_EMAIL, SEED_NAME and SEED_PASSWORD.
const { SEED_EMAIL, SEED_NAME, SEED_PASSWORD } = process.env;
const scripted = SEED_EMAIL && SEED_NAME && SEED_PASSWORD;
const email = scripted ? SEED_EMAIL : await ask('Email: ');
const name = scripted ? SEED_NAME : await ask('Full name (the last word is shown as "Dr. Surname"): ');
const password = scripted ? SEED_PASSWORD : await ask('Password (min 8 characters): ', true);
const again = scripted ? SEED_PASSWORD : await ask('Password again: ', true);
rl.close();

if (!email.includes('@')) fail('That does not look like an email.');
if (name.split(/\s+/).length < 2) fail('Give a first name and a surname.');
if (password.length < 8) fail('Password must be at least 8 characters.');
if (password !== again) fail('Passwords do not match.');

const { user, account } = await dentistRows({ email, name, password });
const q = (v: string | number) => (typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`);
const sql = [
    `INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES (${[user.id, user.name, user.email].map(q).join(', ')}, 0, ${q(user.role)}, ${user.createdAt}, ${user.updatedAt});`,
    `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (${[account.id, account.accountId, account.providerId, account.userId, account.password].map(q).join(', ')}, ${account.createdAt}, ${account.updatedAt});`,
].join('\n');

const dir = mkdtempSync(join(tmpdir(), 'seed-dentist-'));
const file = join(dir, 'seed.sql');
try {
    writeFileSync(file, sql, { mode: 0o600 });
    const result = spawnSync('npx', ['wrangler', 'd1', 'execute', db, remote ? '--remote' : '--local', ...persistArgs, '--file', file], {
        stdio: 'inherit',
    });
    if (result.status !== 0) fail('wrangler failed; no Dentist was created.');
    console.log(`\nDentist ${user.email} created in ${db} (${remote ? 'remote' : 'local'}).`);
} finally {
    rmSync(dir, { recursive: true, force: true });
}
