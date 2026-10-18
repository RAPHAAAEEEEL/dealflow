import { redirect } from "next/navigation";
import { accessConfigFromEnv, mayEnter, SIGN_IN_PATH } from "@/access/access";
import { auth } from "@/auth";

// The check next to the data (docs/adr/0006): every page and every write asks it, whatever the proxy did.
export async function isOwner(): Promise<boolean> {
  const config = accessConfigFromEnv();
  const session = config.loginConfigured ? await auth() : null;
  return mayEnter(session?.githubId, config);
}

export async function requireOwner() {
  if (await isOwner()) return;
  if (accessConfigFromEnv().loginConfigured) redirect(SIGN_IN_PATH);
  throw new Error("Dealflow is not configured for sign-in here, so it stays shut.");
}
