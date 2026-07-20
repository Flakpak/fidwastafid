import { existsSync } from "node:fs";

// ============================================================
// FIDWASTAFID — Parsing d'arguments CLI robuste (Phase 7B, incident du
// 20/07/2026 : le workflow appelait `pnpm --filter pipeline run insert-deals
// -- <fichier>` — pnpm transmet le `--` LITTÉRALEMENT au script sous-jacent
// (constaté empiriquement, pas une supposition), au lieu de le consommer
// comme séparateur. insert-deals.mjs lisait alors argv[2] = "--" et tentait
// `readFileSync("--")` → "ENOENT: open '--'". Le workflow est corrigé pour
// ne plus jamais passer "--" (cf. .github/workflows/pipeline-quotidien.yml),
// mais ce module protège aussi le script lui-même contre un futur appel
// (manuel ou via un outil qui réintroduirait ce séparateur).
// ============================================================

/**
 * Premier argument utile — ignore un "--" isolé, où qu'il apparaisse dans
 * la liste (jamais une simple troncature positionnelle). `args` est déjà
 * délesté de `process.argv[0]`/`[1]` (node, script) par l'appelant :
 * `premierArgumentUtile(process.argv.slice(2))`.
 */
export function premierArgumentUtile(args) {
  return args.filter((a) => a !== "--")[0];
}

/**
 * Résout et valide l'argument fichier d'un script CLI à un seul argument
 * positionnel (insert-deals.mjs) — jamais de stack trace ENOENT brute
 * remontée depuis un readFileSync ultérieur : message clair (avec l'usage)
 * si l'argument est absent, ou si le fichier désigné n'existe pas.
 */
export function resoudreFichierArgument(args, usage) {
  const fichier = premierArgumentUtile(args);
  if (!fichier) {
    return { ok: false, message: `Aucun fichier fourni.\n${usage}` };
  }
  if (!existsSync(fichier)) {
    return { ok: false, message: `Fichier "${fichier}" introuvable.\n${usage}` };
  }
  return { ok: true, fichier };
}
