// Who may see the radar (docs/adr/0006, 0007): only the Owner, signed in with GitHub and matched by the
// numeric account id, which never changes (a login can be renamed and then taken by someone else).
// A deployment without a configured login stays shut; only a developer's machine runs open.

export type AccessConfig = { ownerGithubId: string | undefined; loginConfigured: boolean; production: boolean };

export const SIGN_IN_PATH = "/api/auth/signin";

export function mayEnter(githubId: string | null | undefined, { ownerGithubId, loginConfigured, production }: AccessConfig): boolean {
  if (!loginConfigured) return !production;
  return Boolean(ownerGithubId && githubId && githubId === ownerGithubId);
}

export function accessConfigFromEnv(env: Record<string, string | undefined> = process.env): AccessConfig {
  return {
    ownerGithubId: env.DEALFLOW_OWNER_GITHUB_ID,
    loginConfigured: Boolean(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET && env.AUTH_SECRET),
    production: env.NODE_ENV === "production" || Boolean(env.VERCEL),
  };
}
