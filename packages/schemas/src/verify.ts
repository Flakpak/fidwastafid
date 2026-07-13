import {
  publicIdSchema,
  generatePublicId,
  dealInputSchema,
  voteInputSchema,
  authUserSchema,
  slugify,
  dealUrlSlug,
} from "./index.js";

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

console.log("public_id");
check("10 caractères alphabet restreint accepté", publicIdSchema.safeParse("x7k2p9qa23").success);
check("caractère ambigu 'o' rejeté", !publicIdSchema.safeParse("x7k2p9qao1").success);
check("longueur 9 rejetée", !publicIdSchema.safeParse("x7k2p9qa2").success);
check("uuid interne (mauvaise forme) rejeté", !publicIdSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success);
check("generatePublicId() produit un public_id valide", publicIdSchema.safeParse(generatePublicId()).success);
check("generatePublicId() produit des valeurs différentes", generatePublicId() !== generatePublicId());

console.log("\ndeal — physique sans lien (doit passer)");
check(
  "deal physique valide sans lien",
  dealInputSchema.safeParse({
    titre: "Huile Lesieur 5L",
    enseigneSlug: "marjane",
    ville: "Casablanca",
    categorie: "Alimentaire",
    type: "physique",
    prixPromo: 89,
  }).success
);

console.log("\ndeal — en_ligne sans lien (doit échouer)");
const r1 = dealInputSchema.safeParse({
  titre: "Écouteurs sans fil",
  enseigneSlug: "jumia",
  categorie: "High-Tech",
  type: "en_ligne",
  prixPromo: 199,
});
check("rejeté", !r1.success);
check(
  "erreur pointe bien sur 'lien'",
  !r1.success && r1.error.issues.some((i) => i.path.includes("lien"))
);

console.log("\ndeal — en_ligne avec lien (doit passer)");
check(
  "deal en_ligne valide avec lien",
  dealInputSchema.safeParse({
    titre: "Écouteurs sans fil",
    enseigneSlug: "jumia",
    categorie: "High-Tech",
    type: "en_ligne",
    prixPromo: 199,
    lien: "https://jumia.ma/produit-x",
  }).success
);

console.log("\ndeal — prixNormal < prixPromo (doit échouer)");
check(
  "rejeté",
  !dealInputSchema.safeParse({
    titre: "Test incohérent",
    enseigneSlug: "marjane",
    categorie: "Alimentaire",
    type: "physique",
    prixPromo: 100,
    prixNormal: 50,
  }).success
);

console.log("\ndeal — ville hors liste fermée (doit échouer)");
check(
  "rejeté",
  !dealInputSchema.safeParse({
    titre: "Deal ville inconnue",
    enseigneSlug: "marjane",
    ville: "Essaouira", // pas dans la liste fermée VILLES
    categorie: "Alimentaire",
    type: "physique",
    prixPromo: 50,
  }).success
);

console.log("\nvote — sens");
check("chaud accepté", voteInputSchema.safeParse({ sens: "chaud" }).success);
check("froid accepté", voteInputSchema.safeParse({ sens: "froid" }).success);
check("up (ancienne convention) rejeté", !voteInputSchema.safeParse({ sens: "up" }).success);

console.log("\nAuthUser — forme");
check(
  "forme complète acceptée",
  authUserSchema.safeParse({
    id: "550e8400-e29b-41d4-a716-446655440000",
    publicId: "x7k2p9qa23",
    pseudo: "Kamel",
    isAdmin: true,
  }).success
);

console.log("\nslugify / dealUrlSlug");
check("minuscules + tirets", slugify("Huile Lesieur 5L") === "huile-lesieur-5l");
check("accents retirés", slugify("Écouteurs à réduction de bruit") === "ecouteurs-a-reduction-de-bruit");
check("ponctuation -> tirets uniques", slugify("Promo !! -50%  chez Marjane") === "promo-50-chez-marjane");
check("pas de tiret en tête/fin", !slugify("  -Test-  ").startsWith("-") && !slugify("  -Test-  ").endsWith("-"));
check("tronqué à 60 caractères", slugify("x".repeat(100)).length <= 60);
check(
  "titre sans caractère ASCII -> chaîne vide",
  slugify("فيدوستافيد") === ""
);
check(
  "dealUrlSlug compose slug-publicId",
  dealUrlSlug("Huile Lesieur 5L", "x7k2p9qa23") === "huile-lesieur-5l-x7k2p9qa23"
);
check(
  "dealUrlSlug replie sur le public_id si slug vide",
  dealUrlSlug("فيدوستافيد", "x7k2p9qa23") === "x7k2p9qa23"
);

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
