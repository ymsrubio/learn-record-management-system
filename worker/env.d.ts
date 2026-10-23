// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them. Declared by hand.
declare namespace Cloudflare {
    interface Env {
        // Signs and encrypts what Better Auth issues. Production: `wrangler secret put BETTER_AUTH_SECRET`.
        // Local dev: .dev.vars. Tests and previews: a throwaway value in config.
        BETTER_AUTH_SECRET: string;
    }
}
interface Env extends Cloudflare.Env {}
