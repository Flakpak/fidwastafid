import { pourcentageRemise, estRemiseSuffisante, SEUIL_REMISE_MIN_PCT } from "../remise.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality").
 * Règle éditoriale partagée : un deal doit porter une remise d'au moins
 * SEUIL_REMISE_MIN_PCT pour entrer en file. Deux points gardés ici :
 *  - la frontière exacte du seuil (≥, pas >) ;
 *  - la distinction « remise trop faible » (rejet) vs « remise non mesurable »
 *    (laissé passer, compté à part) — rejeter le second reviendrait à lui
 *    prêter une remise faible qu'on n'a pas constatée.
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

console.log("pourcentageRemise — calcul");
{
  check("100 → 50 vaut 50 %", pourcentageRemise(50, 100) === 50);
  check("285 → 85 vaut ~70,2 %", Math.abs(pourcentageRemise(85, 285) - 70.175) < 0.01);
  check("750 → 630 vaut 16 %", Math.abs(pourcentageRemise(630, 750) - 16) < 0.001);
  check("aucune remise → 0 %", pourcentageRemise(100, 100) === 0);
}

console.log("\npourcentageRemise — non mesurable donne null, jamais 0");
{
  check("prix normal null", pourcentageRemise(50, null) === null);
  check("prix normal undefined", pourcentageRemise(50, undefined) === null);
  check("prix normal 0", pourcentageRemise(50, 0) === null);
  check("prix normal non numérique", pourcentageRemise(50, "abc") === null);
  check("prix promo non numérique", pourcentageRemise("abc", 100) === null);
}

console.log(`\nestRemiseSuffisante — frontière du seuil (${SEUIL_REMISE_MIN_PCT} %)`);
{
  const auSeuil = estRemiseSuffisante(70, 100); // exactement 30 %
  check("exactement au seuil → accepté (≥, pas >)", auSeuil.ok === true);
  check("pct au seuil, à l'imprécision flottante près", Math.abs(auSeuil.pct - 30) < 1e-9);
  // (1 - 70/100) * 100 vaut 30.000000000000004 en IEEE 754 : la frontière ne
  // doit pas dépendre des décimales du prix. Quelques couples valant tous
  // exactement 30 % en mathématiques, à accepter sans exception.
  const auSeuilVaries = [
    [70, 100],
    [35, 50],
    [21, 30],
    [140, 200],
    [7, 10],
    [630, 900],
  ];
  check(
    "tous les couples à exactement 30 % passent, quelles que soient les décimales",
    auSeuilVaries.every(([p, n]) => estRemiseSuffisante(p, n).ok === true)
  );
  const justeEnDessous = estRemiseSuffisante(70.5, 100); // 29,5 %
  check("juste en dessous → rejeté", justeEnDessous.ok === false);
  check("juste en dessous → pourcentage remonté pour le log", Math.abs(justeEnDessous.pct - 29.5) < 0.001);
  check("largement au-dessus → accepté", estRemiseSuffisante(30, 100).ok === true);
  check("remise nulle → rejetée", estRemiseSuffisante(100, 100).ok === false);
}

console.log("\nestRemiseSuffisante — non mesurable : passe, mais se signale");
{
  const r = estRemiseSuffisante(50, null);
  check("passe (jamais rejeté sur une remise non constatée)", r.ok === true);
  check("signalé comme non mesurable", r.mesurable === false);
  check("pourcentage null, pas 0", r.pct === null);
}

console.log("\nestRemiseSuffisante — seuil surchargeable (cadran éditorial)");
{
  check("à 50 %, une remise de 40 % est rejetée", estRemiseSuffisante(60, 100, 50).ok === false);
  check("à 10 %, la même remise passe", estRemiseSuffisante(60, 100, 10).ok === true);
  check("à 0 %, tout ce qui est mesurable passe", estRemiseSuffisante(99, 100, 0).ok === true);
}

console.log("\ncas réels mesurés le 02/08/2026");
{
  check("Kiabi, baskets 285 → 85 : accepté", estRemiseSuffisante(85, 285).ok === true);
  check("Bestmark, tiroir 750 → 630 (16 %) : rejeté", estRemiseSuffisante(630, 750).ok === false);
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
