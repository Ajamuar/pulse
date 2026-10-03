import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "./config";

const google = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };

describe("parseConfig", () => {
  it("defaults: demo mode, port 3000, the local dev database, sign-up open", () => {
    const c = parseConfig({});
    expect(c.dataSource).toBe("demo");
    expect(c.google).toBeNull();
    expect(c.port).toBe(3000);
    expect(c.databaseUrl).toBe("postgres://pulse:pulse@localhost:5432/pulse");
    expect(c.disableSignup).toBe(false);
    expect(c.authSecret).toBeNull();
  });

  it("Google mode exposes the client, with no APP_URL by default", () => {
    const c = parseConfig({ ...google, DATA_SOURCE: "google" });
    expect(c.google).toEqual({ clientId: "id", clientSecret: "secret", appUrl: null });
  });

  it("APP_URL drops its trailing slash; DATABASE_URL, BETTER_AUTH_SECRET and DISABLE_SIGNUP pass through", () => {
    const c = parseConfig({
      ...google,
      DATA_SOURCE: "google",
      APP_URL: "https://pulse.example.com/",
      DATABASE_URL: "postgres://u:p@db:5432/pulse",
      BETTER_AUTH_SECRET: "x".repeat(32),
      DISABLE_SIGNUP: "true",
    });
    expect(c.google).toMatchObject({ appUrl: "https://pulse.example.com" });
    expect(c.appUrl).toBe("https://pulse.example.com");
    expect(c.databaseUrl).toBe("postgres://u:p@db:5432/pulse");
    expect(c.authSecret).toBe("x".repeat(32));
    expect(c.disableSignup).toBe(true);
  });

  it("Google mode without a client ID fails with a named error", () => {
    const env = { ...google, DATA_SOURCE: "google", GOOGLE_CLIENT_ID: undefined };
    expect(() => parseConfig(env)).toThrow(ConfigError);
    expect(() => parseConfig(env)).toThrow(/GOOGLE_CLIENT_ID: required when DATA_SOURCE=google/);
  });

  it("treats empty values as unset", () => {
    expect(() => parseConfig({ ...google, DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "" })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("rejects a bad database URL, short secret, app URL or DATA_SOURCE, naming each", () => {
    const err = (() => {
      try {
        parseConfig({ DATABASE_URL: "mysql://x", BETTER_AUTH_SECRET: "short", APP_URL: "nope", DATA_SOURCE: "maybe" });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err).toBeInstanceOf(ConfigError);
    for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "APP_URL", "DATA_SOURCE"]) expect(err?.message).toContain(key);
  });
});
