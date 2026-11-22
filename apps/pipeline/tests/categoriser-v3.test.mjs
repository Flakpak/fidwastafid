import { mapCategorie } from "../_lib/categoriser.mjs";
import { categorieSchema } from "@fidwastafid/schemas";

/**
 * Tests unitaires — offline (job CI "quality"). Taxonomie v3 (CONTRAT-V1 §3,
 * vingt-deuxième amendement) : titres RÉELS des deals publiés classés
 * « Autre » relevés à l'audit SEO-2 (22/11/2026), et la catégorie que le
 * reclassement manuel leur attribue (migration 0026).
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

const FOURNITURES = [
  "12 CRAYONS DE CIRE TRIANGULAIRES FATIH",
  "12 CRAYONS DE COULEUR EN TUBE SHINY SILKA",
  "6 CRAYONS DE CIRE COULEURS NEON FATIH",
  "CRAYON NOIR HB MOTIF DINAUSORE FATIH",
  "ENSEMBLE DE PEINTURE AUX DOIGTS 6 COULEURS 17ML SILKA",
  "PRESSE-PAPIERS MOTIF PANDA 32*21,5*1,5CM VUKI",
  "PUNAISE 35 PIECES",
  "PUZZLE PEINTURE A L’AQUARELLE 12 COULEURS FATIH",
  "RUBAN ADHESIF AVEC DEVIDOIR",
  "SET AGRAFEUSE + AGRAFES 5,5*11 CM",
  "TROUSSE A CRAYONS A FERMETURE ECLAIR TRANSPARENTE EAU PAILLETEE 24*17*0,2CM MOTIF ASTRONAUTE VUKI",
  "TROUSSE A CRAYONS A FERMETURE ECLAIR TRANSPARENTE MOTIF LICORNE 18,5*9*6CM VUKI",
];

const ENFANTS_JOUETS = [
  "BLOCS DE CONSTRUCTION 120 PIECES",
  "BOUEE DESIGN LUNETTES DE SOLEIL 76CM BESTWAY",
  "COFFRET CREATIF BRACELETS ET COLLIERS",
  "CUBE EDUCATIF TRIEUR DE FORMES",
  "GILET DE SAUVETAGE MULTICOLORE FISHER-PRICE",
  "PISCINE FAMILY PLAY POOL 200*146*48CM SPIDER-MAN",
  "ARMOIRE DRESSING POUR POUPEE AVEC VETEMENTS & ACCESSOIRES",
];

console.log("mapCategorie — Fournitures scolaires (titres réels de l'annexe SEO-2)");
for (const titre of FOURNITURES) {
  check(titre, mapCategorie("", titre, "") === "Fournitures scolaires");
}

console.log("mapCategorie — Enfants & Jouets (titres réels de l'annexe SEO-2)");
for (const titre of ENFANTS_JOUETS) {
  check(titre, mapCategorie("", titre, "") === "Enfants & Jouets");
}

console.log("mapCategorie — valeurs acceptées par l'enum canonique");
{
  check("« Fournitures scolaires » est dans categorieSchema", categorieSchema.safeParse("Fournitures scolaires").success);
  check("« Enfants & Jouets » est dans categorieSchema", categorieSchema.safeParse("Enfants & Jouets").success);
  check("plus jamais « Enfants » (hors enum)", mapCategorie("", "JOUET EN BOIS BEBE", "") !== "Enfants");
}

console.log("mapCategorie — non-régression");
{
  check("électroménager inchangé", mapCategorie("", "CUISEUR VAPEUR MIXEUR 400W", "") === "Électroménager");
  check("repli « Autre » toujours possible", mapCategorie("", "PRODUIT SANS MOT-CLE", "") === "Autre");
}

console.log(`\n${pass} ok, ${fail} échec(s)`);
if (fail > 0) process.exit(1);
