import { estExpirable } from "../expiration.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base de données (job CI
 * "quality", `pnpm test` à la racine). Vérifie uniquement le prédicat pur
 * (expiration.mjs) : la vraie UPDATE SQL (expirer-auto-draft.mjs) n'est
 * testable qu'en intégration (base réelle), hors périmètre ici.
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

const MAINTENANT = new Date("2026-07-20T00:00:00.000Z");

function ilYA(jours) {
  return new Date(MAINTENANT.getTime() - jours * 24 * 60 * 60 * 1000).toISOString();
}

console.log("estExpirable — auto_draft de 15 jours (exemple du lot)");
check("15 jours -> expirable", estExpirable({ statut: "auto_draft", createdAt: ilYA(15) }, MAINTENANT));

console.log("\nestExpirable — auto_draft de 13 jours (exemple du lot)");
check("13 jours -> pas encore expirable", !estExpirable({ statut: "auto_draft", createdAt: ilYA(13) }, MAINTENANT));

console.log("\nestExpirable — deal publié jamais touché, quel que soit l'âge (exemple du lot)");
check(
  "publie très ancien -> jamais expirable",
  !estExpirable({ statut: "publie", createdAt: ilYA(365) }, MAINTENANT)
);

console.log("\nestExpirable — autres statuts jamais touchés par cette étape");
check("en_attente ancien -> jamais expirable", !estExpirable({ statut: "en_attente", createdAt: ilYA(100) }, MAINTENANT));
check("rejete ancien -> jamais expirable", !estExpirable({ statut: "rejete", createdAt: ilYA(100) }, MAINTENANT));
check(
  "déjà expire -> jamais re-touché",
  !estExpirable({ statut: "expire", createdAt: ilYA(100) }, MAINTENANT)
);

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
