import { AuthError, type AuthUser } from "@fidwastafid/schemas";
import { extractSessionToken, SESSION_COOKIE_NAME } from "./token.js";
import { assertUser, assertAdmin } from "./guards.js";
import { getCurrentUser, requireUser, requireAdmin } from "./index.js";

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  ok  - ${label}`);
  } else {
    fail++;
    console.log(`FAIL  - ${label}`);
  }
}

async function checkAuthError(label: string, expectedCode: "UNAUTHENTICATED" | "FORBIDDEN", fn: () => unknown) {
  try {
    await fn();
    fail++;
    console.log(`FAIL  - ${label} (n'a pas levé)`);
  } catch (err) {
    const ok = err instanceof AuthError && err.code === expectedCode;
    if (ok) {
      pass++;
      console.log(`  ok  - ${label}`);
    } else {
      fail++;
      console.log(`FAIL  - ${label} (${String(err)})`);
    }
  }
}

const ADMIN: AuthUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  publicId: "x7k2p9qa23",
  pseudo: "Kamel",
  isAdmin: true,
};

const MEMBER: AuthUser = { ...ADMIN, isAdmin: false, publicId: "m3k2p9qa23" };

async function main() {
  console.log("extractSessionToken");
  check(
    "aucun header -> null",
    extractSessionToken(new Request("http://x.test")) === null
  );
  check(
    "Authorization: Bearer -> token",
    extractSessionToken(
      new Request("http://x.test", { headers: { authorization: "Bearer abc123" } })
    ) === "abc123"
  );
  check(
    "Authorization insensible à la casse (bearer)",
    extractSessionToken(
      new Request("http://x.test", { headers: { authorization: "bearer abc123" } })
    ) === "abc123"
  );
  check(
    `cookie ${SESSION_COOKIE_NAME} -> token`,
    extractSessionToken(
      new Request("http://x.test", { headers: { cookie: `${SESSION_COOKIE_NAME}=cookieTok; autre=1` } })
    ) === "cookieTok"
  );
  check(
    "Bearer prioritaire sur le cookie si les deux sont présents",
    extractSessionToken(
      new Request("http://x.test", {
        headers: {
          authorization: "Bearer headerTok",
          cookie: `${SESSION_COOKIE_NAME}=cookieTok`,
        },
      })
    ) === "headerTok"
  );
  check(
    "Authorization mal formé -> repli sur le cookie",
    extractSessionToken(
      new Request("http://x.test", {
        headers: { authorization: "Basic xyz", cookie: `${SESSION_COOKIE_NAME}=cookieTok` },
      })
    ) === "cookieTok"
  );
  check(
    "cookie sans le bon nom -> null",
    extractSessionToken(
      new Request("http://x.test", { headers: { cookie: "autre=1" } })
    ) === null
  );

  console.log("\nassertUser / assertAdmin (logique pure, sans réseau)");
  check("assertUser(user) renvoie le user", assertUser(MEMBER) === MEMBER);
  await checkAuthError("assertUser(null) -> UNAUTHENTICATED", "UNAUTHENTICATED", () => assertUser(null));
  check("assertAdmin(admin) renvoie le user", assertAdmin(ADMIN) === ADMIN);
  await checkAuthError("assertAdmin(null) -> FORBIDDEN", "FORBIDDEN", () => assertAdmin(null));
  await checkAuthError("assertAdmin(non-admin) -> FORBIDDEN", "FORBIDDEN", () => assertAdmin(MEMBER));

  console.log("\ngetCurrentUser/requireUser/requireAdmin — requête sans token (aucun réseau nécessaire)");
  const noTokenRequest = new Request("http://x.test");
  check("getCurrentUser sans token -> null", (await getCurrentUser(noTokenRequest)) === null);
  await checkAuthError("requireUser sans token -> UNAUTHENTICATED", "UNAUTHENTICATED", () =>
    requireUser(noTokenRequest)
  );
  await checkAuthError("requireAdmin sans token -> FORBIDDEN", "FORBIDDEN", () =>
    requireAdmin(noTokenRequest)
  );

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

main();
