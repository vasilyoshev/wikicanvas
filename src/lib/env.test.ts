describe("appEnv", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults githubRepoUrl to the WikiCanvas repo", () => {
    delete process.env.EXPO_PUBLIC_GITHUB_REPO_URL;
    const { appEnv } = require("@/src/lib/env");
    expect(appEnv.githubRepoUrl).toBe("https://github.com/vasilyoshev/wikicanvas");
  });

  it("reads supabase url and key from the environment", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test";
    const { appEnv, hasSupabaseConfig } = require("@/src/lib/env");
    expect(appEnv.supabaseUrl).toBe("https://example.supabase.co");
    expect(appEnv.supabaseKey).toBe("pk_test");
    expect(hasSupabaseConfig).toBe(true);
  });

  it("hasSupabaseConfig is false when config is absent", () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const { hasSupabaseConfig } = require("@/src/lib/env");
    expect(hasSupabaseConfig).toBe(false);
  });

  it("does not expose a web-push VAPID key", () => {
    const env = require("@/src/lib/env").appEnv;
    expect(env).not.toHaveProperty("webPushVapidPublicKey");
  });
});
