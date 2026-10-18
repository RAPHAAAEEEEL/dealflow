import { describe, expect, test } from "vitest";
import { accessConfigFromEnv, mayEnter } from "./access";

// GitHub account ids never change; logins can be renamed and then taken by someone else.
const OWNER_ID = "4242424";
const deployed = { ownerGithubId: OWNER_ID, loginConfigured: true, production: true };

describe("Access to the radar", () => {
  test.each([
    ["lets the Owner in", OWNER_ID, deployed, true],
    ["turns away any other GitHub account", "1234567", deployed, false],
    ["turns away a visitor who isn't signed in", undefined, deployed, false],
    ["stays shut when no Owner is configured", OWNER_ID, { ...deployed, ownerGithubId: undefined }, false],
    ["stays shut in production when login isn't configured", undefined, { ...deployed, loginConfigured: false }, false],
    ["stays open on a developer's machine without login", undefined, { ownerGithubId: undefined, loginConfigured: false, production: false }, true],
  ])("%s", (_, githubId, config, expected) => {
    expect(mayEnter(githubId, config)).toBe(expected);
  });
});

describe("Reading the access settings", () => {
  const login = { AUTH_SECRET: "s", AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "secret", DEALFLOW_OWNER_GITHUB_ID: OWNER_ID };

  test.each([
    ["a production build", { NODE_ENV: "production" }, { production: true, loginConfigured: false }],
    ["anything running on Vercel, even outside production mode", { VERCEL: "1", NODE_ENV: "development" }, { production: true, loginConfigured: false }],
    ["a developer's machine", { NODE_ENV: "development" }, { production: false, loginConfigured: false }],
    ["all three sign-in settings present", { NODE_ENV: "production", ...login }, { production: true, loginConfigured: true }],
    ["one sign-in setting missing", { NODE_ENV: "production", ...login, AUTH_SECRET: undefined }, { production: true, loginConfigured: false }],
  ])("recognises %s", (_, env, expected) => {
    expect(accessConfigFromEnv(env)).toMatchObject(expected);
  });
});
