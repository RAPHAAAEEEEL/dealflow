import { NextResponse } from "next/server";
import { accessConfigFromEnv, SIGN_IN_PATH } from "@/access/access";
import { auth } from "@/auth";

// A quick first gate: anyone without a session goes to the GitHub sign-in. The real check is
// requireOwner() on every page and action. Without a configured login (a developer's machine)
// requests pass, and pages decide.
export default accessConfigFromEnv().loginConfigured
  ? auth((request) => {
      if (!request.auth) return NextResponse.redirect(new URL(SIGN_IN_PATH, request.nextUrl));
    })
  : () => NextResponse.next();

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
