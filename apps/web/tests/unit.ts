import { isPrivateOrReservedIp, assertPublicUrl, SsrfGuardError } from "../src/app/api/v1/_lib/ssrf.js";
import { extractImageUrl } from "../src/app/api/v1/_lib/ogImage.js";

/**
 * Tests unitaires — offline, aucun réseau ni base de données (job CI
 * "quality", `pnpm test` à la racine, jamais bloqué par les secrets Supabase).
 * Complète tests/integration.ts (celui-ci exige un vrai Postgres + JWT).
 *
 * Garde SSRF (CONTRAT-V1 §4, troisième amendement conscient du 19/07/2026) :
 * cas hostiles explicitement listés par l'amendement, plus quelques bornes
 * de plage (172.15/172.32, limites de fc00::/7 et fe80::/10).
 */

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

console.log("SSRF — isPrivateOrReservedIp : cas hostiles (doivent être rejetés)");
check("10.0.0.0 (RFC1918)", isPrivateOrReservedIp("10.0.0.0"));
check("10.255.255.255 (RFC1918)", isPrivateOrReservedIp("10.255.255.255"));
check("172.16.0.0 (RFC1918, borne basse)", isPrivateOrReservedIp("172.16.0.0"));
check("172.31.255.255 (RFC1918, borne haute)", isPrivateOrReservedIp("172.31.255.255"));
check("192.168.1.1 (RFC1918)", isPrivateOrReservedIp("192.168.1.1"));
check("127.0.0.1 (loopback)", isPrivateOrReservedIp("127.0.0.1"));
check("127.255.255.255 (loopback, borne haute)", isPrivateOrReservedIp("127.255.255.255"));
check("169.254.169.254 (métadonnées cloud)", isPrivateOrReservedIp("169.254.169.254"));
check("0.0.0.0 (this network)", isPrivateOrReservedIp("0.0.0.0"));
check("::1 (loopback IPv6)", isPrivateOrReservedIp("::1"));
check("fc00::1 (unique-local IPv6, borne basse)", isPrivateOrReservedIp("fc00::1"));
check("fdff:ffff::1 (unique-local IPv6, borne haute)", isPrivateOrReservedIp("fdff:ffff::1"));
check("fe80::1 (link-local IPv6)", isPrivateOrReservedIp("fe80::1"));
check("::ffff:127.0.0.1 (IPv4 loopback mappée en IPv6)", isPrivateOrReservedIp("::ffff:127.0.0.1"));
check("::ffff:10.0.0.5 (IPv4 privée mappée en IPv6)", isPrivateOrReservedIp("::ffff:10.0.0.5"));

console.log("\nSSRF — isPrivateOrReservedIp : bornes limitrophes (doivent être ACCEPTÉES, hors plage)");
check("172.15.255.255 juste sous 172.16/12 -> public", !isPrivateOrReservedIp("172.15.255.255"));
check("172.32.0.0 juste au-dessus de 172.31/12 -> public", !isPrivateOrReservedIp("172.32.0.0"));
check("169.253.255.255 juste sous 169.254/16 -> public", !isPrivateOrReservedIp("169.253.255.255"));
check("fbff:ffff::1 juste sous fc00::/7 -> public", !isPrivateOrReservedIp("fbff:ffff::1"));

console.log("\nSSRF — isPrivateOrReservedIp : IP publiques (doivent être acceptées)");
check("8.8.8.8 (DNS public)", !isPrivateOrReservedIp("8.8.8.8"));
check("93.184.216.34 (IP publique quelconque)", !isPrivateOrReservedIp("93.184.216.34"));
check("2001:4860:4860::8888 (DNS public IPv6)", !isPrivateOrReservedIp("2001:4860:4860::8888"));

console.log("\nSSRF — assertPublicUrl : protocole et résolution");
async function checkAsyncRejects(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false);
  } catch (err) {
    check(label, err instanceof SsrfGuardError);
  }
}
async function checkAsyncResolves(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, true);
  } catch {
    check(label, false);
  }
}

async function runAsyncChecks() {
  await checkAsyncRejects("ftp:// rejeté (protocole non autorisé)", () => assertPublicUrl("ftp://example.com/x"));
  await checkAsyncRejects("file:// rejeté (protocole non autorisé)", () => assertPublicUrl("file:///etc/passwd"));
  await checkAsyncRejects("URL invalide rejetée", () => assertPublicUrl("pas-une-url"));
  await checkAsyncRejects("http://127.0.0.1 rejeté (littéral IP loopback)", () => assertPublicUrl("http://127.0.0.1/x"));
  await checkAsyncRejects("http://169.254.169.254 rejeté (métadonnées cloud)", () =>
    assertPublicUrl("http://169.254.169.254/latest/meta-data")
  );
  await checkAsyncRejects("http://[::1] rejeté (littéral IPv6 loopback)", () => assertPublicUrl("http://[::1]/x"));
  await checkAsyncResolves("https://exemple-litteral-ip-publique accepté (protocole + IP publique)", () =>
    assertPublicUrl("https://8.8.8.8/x")
  );

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

console.log("\nog:image — extraction depuis HTML");
check(
  "og:image trouvé (attribut property avant content)",
  extractImageUrl('<html><head><meta property="og:image" content="https://ex.com/a.jpg"></head></html>', "https://ex.com/page") ===
    "https://ex.com/a.jpg"
);
check(
  "og:image trouvé (attribut content avant property, ordre inversé)",
  extractImageUrl('<meta content="https://ex.com/b.jpg" property="og:image">', "https://ex.com/page") ===
    "https://ex.com/b.jpg"
);
check(
  "og:image absent -> repli twitter:image",
  extractImageUrl('<meta name="twitter:image" content="https://ex.com/c.jpg">', "https://ex.com/page") ===
    "https://ex.com/c.jpg"
);
check(
  "og:image et twitter:image absents -> repli <link rel=image_src>",
  extractImageUrl('<link rel="image_src" href="https://ex.com/d.jpg">', "https://ex.com/page") === "https://ex.com/d.jpg"
);
check(
  "URL relative résolue contre l'URL de la page",
  extractImageUrl('<meta property="og:image" content="/img/e.jpg">', "https://ex.com/produit/123") ===
    "https://ex.com/img/e.jpg"
);
check(
  "aucune des trois sources -> null",
  extractImageUrl("<html><head><title>Rien ici</title></head></html>", "https://ex.com/page") === null
);
check(
  "guillemets simples acceptés",
  extractImageUrl("<meta property='og:image' content='https://ex.com/f.jpg'>", "https://ex.com/page") ===
    "https://ex.com/f.jpg"
);

void runAsyncChecks();
