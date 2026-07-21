import { isPrivateOrReservedIp, assertPublicUrl, SsrfGuardError } from "../src/app/api/v1/_lib/ssrf.js";
import { extractImageUrl } from "../src/app/api/v1/_lib/ogImage.js";
import { sniffImageMime } from "../src/app/api/v1/_lib/dealImage.js";
import { POST as postRevalidate } from "../src/app/api/revalidate/route.js";
import { dealOgDescription, truncateOgTitle, dealJsonLd } from "../src/app/deal/[slugAndId]/seo.js";
import { buildShareText } from "../src/components/shareText.js";
import type { Deal } from "@fidwastafid/schemas";

// Jeton de test purement local (Phase 7B) — jamais le vrai REVALIDATE_TOKEN,
// qui n'existe que côté Vercel/secrets GitHub. Comparable au
// TURNSTILE_SECRET_KEY "always passes" déjà en clair dans .github/workflows/
// ci.yml : une valeur fixture, pas un secret.
process.env.REVALIDATE_TOKEN = "jeton-de-test-local-jamais-reel";

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

  console.log("\nPOST /api/revalidate — jeton (cas d'erreur, avant tout accès base)");
  const sansJetonRes = await postRevalidate(new Request("http://localhost/api/revalidate", { method: "POST" }));
  check("sans jeton -> 401", sansJetonRes.status === 401);

  const mauvaisJetonRes = await postRevalidate(
    new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "x-revalidate-token": "mauvais-jeton" },
    })
  );
  check("mauvais jeton -> 401", mauvaisJetonRes.status === 401);

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

console.log("\nsniffImageMime — détection par magic bytes (jamais le Content-Type déclaré)");
const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const validWebp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from("WEBP")]);
// .exe renommé .jpg — l'en-tête DOS "MZ" ne correspond à aucune signature
// image, rejeté quel que soit le nom de fichier ou le Content-Type déclaré
// par le client au moment de l'upload.
const fakeExeAsJpg = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
const plainText = Buffer.from("Ceci n'est pas du tout une image, juste du texte brut.");

check("JPEG valide -> image/jpeg", sniffImageMime(validJpeg) === "image/jpeg");
check("PNG valide -> image/png", sniffImageMime(validPng) === "image/png");
check("WebP valide -> image/webp", sniffImageMime(validWebp) === "image/webp");
check(".exe renommé .jpg -> rejeté (null)", sniffImageMime(fakeExeAsJpg) === null);
check("texte brut -> rejeté (null)", sniffImageMime(plainText) === null);
check("buffer vide -> rejeté (null)", sniffImageMime(Buffer.alloc(0)) === null);
check("buffer trop court pour toute signature -> rejeté (null)", sniffImageMime(Buffer.from([0xff, 0xd8])) === null);

console.log("\ndealOgDescription — incident du 20/07/2026 : jamais le titre, jamais la description produit");
check(
  "prix barré + enseigne -> \"{prix} DH au lieu de {prix barré} DH (-{remise}%) · {enseigne}\"",
  dealOgDescription({ prixPromo: 599, prixNormal: 999, enseigneNom: "Decathlon", nomVendeur: undefined }) ===
    "599 DH au lieu de 999 DH (-40%) · Decathlon"
);
check(
  "prix barré sans enseigne (ni enseigneNom ni nomVendeur) -> pas de \"·\" final",
  dealOgDescription({ prixPromo: 599, prixNormal: 999, enseigneNom: undefined, nomVendeur: undefined }) ===
    "599 DH au lieu de 999 DH (-40%)"
);
check(
  "enseigneNom absent -> repli sur nomVendeur (vendeur informel, CONTRAT-V1 §3)",
  dealOgDescription({ prixPromo: 50, prixNormal: 100, enseigneNom: undefined, nomVendeur: "Hanout Rachid" }) ===
    "50 DH au lieu de 100 DH (-50%) · Hanout Rachid"
);
check(
  "pas de prix barré + enseigne -> \"Bon plan chez {enseigne}\"",
  dealOgDescription({ prixPromo: 99, prixNormal: undefined, enseigneNom: "Marjane", nomVendeur: undefined }) ===
    "Bon plan chez Marjane"
);
check(
  "ni prix barré ni enseigne -> repli minimal \"{prix} DH\"",
  dealOgDescription({ prixPromo: 99, prixNormal: undefined, enseigneNom: undefined, nomVendeur: undefined }) === "99 DH"
);
check(
  "prixNormal <= prixPromo (donnée incohérente) -> traité comme \"pas de remise\", jamais un pourcentage négatif/nul",
  dealOgDescription({ prixPromo: 100, prixNormal: 80, enseigneNom: "Jumia", nomVendeur: undefined }) ===
    "Bon plan chez Jumia"
);

console.log("\ntruncateOgTitle — coupe sur un espace, jamais en plein mot, ~70 caractères");
const titreCourt = "Bodyboard BB 500 confirmé";
check("titre court (<70) -> inchangé", truncateOgTitle(titreCourt) === titreCourt);
const titreLong =
  "Bodyboard BB 500 confirmé Double stringer - Grey yellow Jaune gris avec leash biceps poignet fourni et housse";
const tronque = truncateOgTitle(titreLong);
check("titre long (>70) -> tronqué avec ellipse finale", tronque.endsWith("…") && tronque.length <= 71);
check("titre long -> jamais coupé en plein mot (se termine par …, pas par un mot amputé collé)", !tronque.slice(0, -1).endsWith(" "));
check(
  "aucun espace exploitable avant `max` -> coupe brute plutôt qu'un titre quasi vide",
  truncateOgTitle("a".repeat(50) + " b", 10, 20).length <= 11
);

console.log("\nbuildShareText — sans titre, sans préfixe \"Fidwastafid :\" (incident du 20/07/2026)");
check(
  "avec remise -> \"{prix} DH (-{remise}%)\\n{url}\"",
  buildShareText(599, 999, "https://fidwastafid.com/deal/x-abc123defg") ===
    "599 DH (-40%)\nhttps://fidwastafid.com/deal/x-abc123defg"
);
check(
  "sans prixNormal -> pas de parenthèse de remise",
  buildShareText(99, undefined, "https://fidwastafid.com/deal/y-hij456klmn") ===
    "99 DH\nhttps://fidwastafid.com/deal/y-hij456klmn"
);
check(
  "prixNormal <= prixPromo (incohérent) -> traité comme sans remise",
  buildShareText(100, 80, "https://fidwastafid.com/deal/z") === "100 DH\nhttps://fidwastafid.com/deal/z"
);
check("jamais \"Fidwastafid :\" dans le texte", !buildShareText(599, 999, "https://fidwastafid.com/deal/x").includes("Fidwastafid"));

console.log("\ndealJsonLd — Product/Offer schema.org (lot GEO du 21/07/2026, constats curl prod)");
const dealJsonLdBase: Deal = {
  publicId: "abc23456de",
  titre: "Deal test JSON-LD",
  categorie: "Autre",
  type: "en_ligne",
  prixPromo: 100,
  statut: "publie",
  score: 0,
  submitterPublicId: null,
  submitterPseudo: null,
  submitterCouleurAvatar: null,
  commentairesCount: 0,
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

const avecPhoto = dealJsonLd({ ...dealJsonLdBase, imageKey: "deals/abc23456de.webp" }, "/deal/x-abc23456de");
check(
  "deal avec imageKey -> image = URL absolue /img/deals/{publicId} (jamais opengraph-image générique, jamais Supabase)",
  avecPhoto.image === "https://fidwastafid.com/img/deals/abc23456de"
);

const sansPhoto = dealJsonLd(dealJsonLdBase, "/deal/x-abc23456de");
check(
  "deal sans imageKey -> repli sur l'image générique du site",
  sansPhoto.image === "https://fidwastafid.com/opengraph-image"
);

const publie = dealJsonLd({ ...dealJsonLdBase, statut: "publie" }, "/deal/x-abc23456de");
check("statut publie -> availability InStock", publie.offers.availability === "https://schema.org/InStock");

const expire = dealJsonLd({ ...dealJsonLdBase, statut: "expire", dateFin: "2026-01-01" }, "/deal/x-abc23456de");
check(
  "statut expire -> availability SoldOut (pas OutOfStock, offre définitivement terminée)",
  expire.offers.availability === "https://schema.org/SoldOut"
);
check(
  "statut expire + dateFin présente -> priceValidUntil quand même inclus (fait honnête, pas une promesse)",
  expire.offers.priceValidUntil === "2026-01-01"
);

const sansDateFin = dealJsonLd(dealJsonLdBase, "/deal/x-abc23456de");
check("pas de dateFin -> pas de priceValidUntil", !("priceValidUntil" in sansDateFin.offers));

const avecEnseigne = dealJsonLd({ ...dealJsonLdBase, enseigneNom: "Carrefour" }, "/deal/x-abc23456de");
check(
  "enseigneNom présent -> offers.seller Organization (constat : \"chez carrefour\" visible en description mais absent du JSON-LD avant ce lot)",
  JSON.stringify(avecEnseigne.offers.seller) === JSON.stringify({ "@type": "Organization", name: "Carrefour" })
);

const sansEnseigne = dealJsonLd(dealJsonLdBase, "/deal/x-abc23456de");
check("enseigneNom absent -> pas de champ seller inventé", !("seller" in sansEnseigne.offers));

check("offers.priceCurrency toujours MAD", publie.offers.priceCurrency === "MAD");
check("offers.price est un nombre (pas une chaîne, pas de symbole)", typeof publie.offers.price === "number" && publie.offers.price === 100);
check(
  "JSON-LD sérialisable et re-parsable (forme réellement injectée dans le <script>)",
  JSON.parse(JSON.stringify(publie))["@type"] === "Product" && JSON.parse(JSON.stringify(publie)).offers["@type"] === "Offer"
);

void runAsyncChecks();
