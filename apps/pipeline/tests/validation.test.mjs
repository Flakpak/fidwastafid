import { validateDeal } from "../validation.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base de données (job CI
 * "quality", `pnpm test` à la racine). Vérifie uniquement la validation
 * partagée (validation.mjs -> dealInputSchema, packages/schemas) : le rejet
 * doit primer sur l'invention, jamais l'inverse.
 */

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  ok  - ${label}`);
  } else {
    fail++;
    console.log(`FAIL  - ${label}`);
  }
}

const DEAL_VALIDE = {
  titre: "Huile Lesieur 5L",
  ville: "Casablanca",
  categorie: "Alimentaire",
  type: "physique",
  prix_promo: 89,
  prix_normal: 120,
  date_fin: null,
  description: null,
  lien: null,
};

console.log("validateDeal — deal valide");
check("deal complet et cohérent -> accepté", validateDeal(DEAL_VALIDE).ok);

console.log("\nvalidateDeal — prix manquant (exemple du lot)");
const sansPrixPromo = validateDeal({ ...DEAL_VALIDE, prix_promo: null });
check("prix_promo manquant -> rejeté", !sansPrixPromo.ok);
check("message d'erreur mentionne prixPromo", sansPrixPromo.message?.includes("prixPromo"));

console.log("\nvalidateDeal — titre manquant");
check("titre absent -> rejeté", !validateDeal({ ...DEAL_VALIDE, titre: undefined }).ok);

console.log("\nvalidateDeal — catégorie hors référentiel (jamais de repli silencieux sur \"Autre\")");
check("catégorie \"Enfants\" (absente de l'enum) -> rejeté", !validateDeal({ ...DEAL_VALIDE, categorie: "Enfants" }).ok);

console.log("\nvalidateDeal — cohérence physique/en_ligne (mêmes règles que POST /api/v1/deals)");
check("type en_ligne sans lien -> rejeté", !validateDeal({ ...DEAL_VALIDE, type: "en_ligne", lien: null }).ok);
check(
  "type en_ligne avec lien -> accepté",
  validateDeal({ ...DEAL_VALIDE, type: "en_ligne", lien: "https://exemple.ma/produit" }).ok
);

console.log("\nvalidateDeal — cohérence des prix");
check(
  "prix_normal < prix_promo -> rejeté",
  !validateDeal({ ...DEAL_VALIDE, prix_promo: 100, prix_normal: 50 }).ok
);
check("prix_normal absent (nullable en base) -> accepté", validateDeal({ ...DEAL_VALIDE, prix_normal: null }).ok);

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
