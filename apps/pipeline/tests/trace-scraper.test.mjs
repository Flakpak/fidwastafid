import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cheminTrace, ecrireArchiveEtTrace, lireTrace } from "../_lib/traceScraper.mjs";
import { parseProduits } from "../scraper-kiabi.mjs";

/**
 * Tests unitaires — offline (job CI "quality"). Trace de passage d'un
 * scraper (lot SEO-2e) : aller-retour, et aucun repli silencieux si elle
 * manque ou est invalide. L'écriture de vu_le et de pipeline_runs est testée
 * sur Postgres réel (apps/web/tests/integration.ts).
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

function leve(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const TRACE = {
  lus: 1,
  plafondAtteint: false,
  interrompu: false,
  enseigne: "kiabi",
  releves: [{ titre: "Pull", prix: 99 }],
};

const dossier = mkdtempSync(path.join(tmpdir(), "trace-scraper-"));
try {
  const archive = path.join(dossier, "2026-11-23_05-00_kiabi.json");

  console.log("trace — aller-retour");
  ecrireArchiveEtTrace(archive, [{ titre: "x" }], { ...TRACE, lus: 250, plafondAtteint: true });
  check("le nom de trace suit l'archive", cheminTrace(archive).endsWith("_kiabi.trace.json"));
  check("l'archive reste un tableau de deals", Array.isArray(JSON.parse(readFileSync(archive, "utf8"))));
  const lue = lireTrace(archive);
  check("lus relu", lue.lus === 250);
  check("plafond atteint relu", lue.plafondAtteint === true);
  check("interrompu relu", lue.interrompu === false);
  check("enseigne relue", lue.enseigne === "kiabi");
  check("relevés relus", lue.releves.length === 1 && lue.releves[0].prix === 99);

  console.log("trace — aucun repli silencieux");
  check("trace absente → erreur", leve(() => lireTrace(path.join(dossier, "absente.json"))));
  writeFileSync(cheminTrace(archive), JSON.stringify({ ...TRACE, lus: "250" }));
  check("trace invalide (lus non entier) → erreur", leve(() => lireTrace(archive)));
  writeFileSync(cheminTrace(archive), JSON.stringify({ lus: 10, interrompu: false }));
  check("trace invalide (plafond absent) → erreur", leve(() => lireTrace(archive)));
  writeFileSync(cheminTrace(archive), JSON.stringify({ ...TRACE, releves: undefined }));
  check("trace invalide (relevés absents) → erreur", leve(() => lireTrace(archive)));
  writeFileSync(cheminTrace(archive), JSON.stringify({ ...TRACE, releves: [{ titre: "x", prix: "99" }] }));
  check("trace invalide (prix non numérique) → erreur", leve(() => lireTrace(archive)));
  check("écriture refusée si la trace est invalide", leve(() => ecrireArchiveEtTrace(archive, [], { ...TRACE, lus: -1 })));

  console.log("relevés — un produit écarté par le scraper reste relevé");
  const { deals, releves } = parseProduits({
    products: [
      {
        title: "Pull non remisé",
        handle: "pull",
        variants: [
          { available: true, price: "120.00", compare_at_price: null },
          { available: false, price: "80.00", compare_at_price: null },
        ],
      },
    ],
  });
  check("non remisé → aucun deal", deals.length === 0);
  check("non remisé → relevé au prix de la variante disponible", releves.length === 1 && releves[0].prix === 120);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

console.log(`\n${pass} ok, ${fail} échec(s)`);
if (fail > 0) process.exit(1);
