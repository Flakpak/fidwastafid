import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

/**
 * Vérification STATIQUE (aucune connexion base, aucun secret) — pour toute
 * table créée dans une migration, exige un `enable row level security` sur
 * cette même table DANS LE MÊME FICHIER. Fait générateur : migration 0014
 * (`memoire_curation`) a créé une table sans l'activer, contrairement à
 * TOUTES les autres migrations qui créent une table depuis 0008 — l'écart
 * est resté trois semaines sans qu'aucun advisor Supabase ne le signale
 * (docs/INCIDENTS.md, 15/08/2026). Ce script est la réponse : un contrôle
 * qui ne dépend ni d'un fournisseur externe ni d'une exécution planifiée,
 * bloquant à chaque PR (job `quality`, aucun secret requis — contrairement à
 * `migrations-check`, donc actif y compris sur les PR Dependabot).
 *
 * Volontairement strict pour tout fichier NON listé ci-dessous : une table
 * créée sans RLS activée dans le même fichier est une erreur. Deux groupes
 * d'exceptions, nommés — jamais une liste qui s'allonge en silence :
 */
const EXCEPTIONS_HISTORIQUES: Record<string, string[]> = {
  // Avant 0008 : les 8 premières tables ont été créées SANS RLS puis
  // retrofittées d'un coup par 0008 (RLS n'était pas encore une convention
  // du dépôt à ce stade) — un choix d'époque assumé, pas un oubli. La
  // convention "même fichier" ne commence qu'À PARTIR de 0008 elle-même.
  "0001_init.sql": ["admins", "commentaires", "deals", "enseignes", "users", "votes"],
  "0002_journal_audit.sql": ["journal_audit"],
  "0003_rate_limits.sql": ["rate_limits"],
  // 0014, lui, est postérieur à 0008 — la convention "même fichier" était
  // déjà établie (0011 l'illustre trois jours avant). `memoire_curation` a
  // créé une table sans RLS malgré tout : l'écart réel que ce script existe
  // pour ne plus jamais laisser passer (docs/INCIDENTS.md, 15/08/2026).
  // Corrigé par 0022 (fichier séparé : réécrire 0014 après coup mentirait
  // sur ce qui a réellement tourné en production). Grandfathered ici plutôt
  // que dans la logique de vérification, pour qu'une dérogation future soit
  // aussi visible qu'un ajout à cette liste, jamais une modification
  // discrète du contrôle lui-même.
  "0014_memoire_curation.sql": ["memoire_curation"],
};
function tablesCreees(sql: string): Set<string> {
  const noComments = sql.replace(/--.*$/gm, "");
  const tables = new Set<string>();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi;
  for (const m of noComments.matchAll(re)) {
    if (m[1]) tables.add(m[1].toLowerCase());
  }
  return tables;
}

function tablesRlsActivee(sql: string): Set<string> {
  const noComments = sql.replace(/--.*$/gm, "");
  const tables = new Set<string>();
  const re = /alter\s+table\s+(?:public\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi;
  for (const m of noComments.matchAll(re)) {
    if (m[1]) tables.add(m[1].toLowerCase());
  }
  return tables;
}

async function main() {
  const fichiers = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  let ok = true;
  for (const fichier of fichiers) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, fichier), "utf8");
    const creees = tablesCreees(sql);
    if (creees.size === 0) continue;
    const rls = tablesRlsActivee(sql);
    const exceptees = new Set((EXCEPTIONS_HISTORIQUES[fichier] ?? []).map((t) => t.toLowerCase()));
    const manquantes = [...creees].filter((t) => !rls.has(t) && !exceptees.has(t)).sort();
    if (manquantes.length > 0) {
      ok = false;
      console.error(`ÉCART — ${fichier} crée une table sans activer RLS dans le même fichier :`);
      for (const t of manquantes) console.error(`  - ${t}`);
    }
  }

  if (!ok) {
    console.error(
      "\nChaque `create table` doit être suivi, dans le MÊME fichier, d'un " +
        "`alter table ... enable row level security` — même convention que " +
        "0008/0011/0020/0021. Aucune exception silencieuse (docs/INCIDENTS.md, 15/08/2026)."
    );
    process.exit(1);
  }

  console.log(`OK — ${fichiers.length} migration(s), toute table créée active RLS dans son propre fichier.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
