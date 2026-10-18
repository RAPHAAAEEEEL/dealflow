import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { accessConfigFromEnv, mayEnter } from "@/access/access";

declare module "next-auth" {
  interface Session {
    githubId?: string; // the numeric GitHub account id, as a string
  }
}

const githubIdOf = (profile: { id?: unknown } | undefined) =>
  profile?.id === undefined || profile.id === null ? undefined : String(profile.id);

// Sign-in with GitHub, for the Owner only (docs/adr/0006, 0007). Auth.js reads AUTH_SECRET,
// AUTH_GITHUB_ID and AUTH_GITHUB_SECRET from the environment; the session lives in a signed cookie.
export const { handlers, auth } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  callbacks: {
    signIn: ({ profile }) => mayEnter(githubIdOf(profile), accessConfigFromEnv()),
    jwt: ({ token, profile }) => {
      const githubId = githubIdOf(profile);
      if (githubId) token.githubId = githubId;
      return token;
    },
    session: ({ session, token }) => ({ ...session, githubId: typeof token.githubId === "string" ? token.githubId : undefined }),
  },
});
