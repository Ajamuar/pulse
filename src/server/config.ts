import { z } from "zod";

export class ConfigError extends Error {
  override name = "ConfigError";
}


const Env = z
  .object({
    GOOGLE_OAUTH_ENABLED: z.stringbool().default(false),
    /** Postgres. Unset: the local dev database from compose.dev.yaml. */
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL").optional(),
    /** Signs sessions and auth tokens (better-auth). Required in production: `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32, "use at least 32 characters (openssl rand -base64 32)").optional(),
    /** Who resets forgotten passwords (shown on /forgot as an email button). Unset: "ask whoever runs this server". */
    SUPPORT_EMAIL: z.email("must be an email address").optional(),
    /** `true` closes sign-up: only existing accounts can sign in. */
    DISABLE_SIGNUP: z.stringbool().default(false),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    APP_URL: z.url().optional(),
    /** The Home avatar photo: an absolute URL or a path under public/ ("/me.jpg"). */
    AVATAR_URL: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const need = (keys: (keyof typeof e)[], why: string) => {
      for (const k of keys) if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: `required ${why}` });
    };
    if (e.GOOGLE_OAUTH_ENABLED) {
      need(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], "when GOOGLE_OAUTH_ENABLED=true");
    }
  });

export function parseConfig(env: Record<string, string | undefined>) {
  // Treat empty values (e.g. `GOOGLE_CLIENT_ID=` copied from .env.example) as unset.
  const set = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const r = Env.safeParse(set);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n${lines.join("\n")}`);
  }
  const e = r.data;
  return {
    googleOAuthEnabled: e.GOOGLE_OAUTH_ENABLED,
    databaseUrl: e.DATABASE_URL ?? "postgres://pulse:pulse@localhost:5432/pulse",
    authSecret: e.BETTER_AUTH_SECRET ?? null,
    appUrl: e.APP_URL?.replace(/\/$/, "") ?? null,
    disableSignup: e.DISABLE_SIGNUP,
    supportEmail: e.SUPPORT_EMAIL ?? null,
    port: e.PORT,
    avatarUrl: e.AVATAR_URL ?? null,
    google: e.GOOGLE_OAUTH_ENABLED
      ? {
          clientId: e.GOOGLE_CLIENT_ID!,
          clientSecret: e.GOOGLE_CLIENT_SECRET!,
          /** Pins the OAuth redirect host (behind a proxy). Unset: the host the request came in on. */
          appUrl: e.APP_URL?.replace(/\/$/, "") ?? null,
        }
      : null,
  };
}

export type Config = ReturnType<typeof parseConfig>;

let cached: Config | undefined;

/** Parsed once from process.env; throws ConfigError on invalid configuration. */
export function getConfig(): Config {
  return (cached ??= parseConfig(process.env));
}
