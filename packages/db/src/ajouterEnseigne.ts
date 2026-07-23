import { query, closePool } from "./client.js";
import { enseigneSchema } from "@fidwastafid/schemas";

/**
 * Ajout d'une enseigne curée — LE canal versionné pour ce geste
 * (docs/RUNBOOK-donnees.md), en remplacement du geste ad hoc hors repo
 * constaté pour les 4 enseignes initiales de la prod (bim/bringo/
 * carrefour/marjane, insérées via le Dashboard Supabase avant tout
 * garde-fou — trou de procédure documenté le 23/07/2026).
 *
 * Usage : pnpm --filter @fidwastafid/db ajouter-enseigne <slug> <nom>
 *
 * Même famille que `pnpm migrate` (CONTRAT-V1 §7 : geste humain via le
 * runner) : connexion par DATABASE_URL uniquement, jamais de SQL manuel à
 * main levée. Ce n'est PAS une migration de schéma — c'est une insertion de
 * données curées (CONTRAT-V1 §3 : slug enseigne « curé à la main ») ;
 * `schema_migrations` n'est pas touché.
 *
 * Idempotent : slug déjà présent = message clair et sortie 0, jamais de
 * doublon, jamais d'écrasement du nom existant (un renommage d'enseigne
 * serait une décision curatoriale distincte, pas un effet de bord de ce
 * script).
 */
function usage(): never {
  console.error("Usage : pnpm --filter @fidwastafid/db ajouter-enseigne <slug> <nom>");
  console.error('Exemple : pnpm --filter @fidwastafid/db ajouter-enseigne inwi inwi');
  process.exit(1);
}

const [slugArg, ...nomParts] = process.argv.slice(2);
// Le nom peut contenir des espaces (« Mr Bricolage ») — tout ce qui suit le
// slug est le nom, pas besoin de guillemets shell.
const nomArg = nomParts.join(" ").trim();

if (!slugArg || !nomArg) usage();

// Validation par le schéma partagé (packages/schemas, source de vérité
// unique — jamais une regex recopiée ici) : slug minuscules/chiffres/tirets,
// 1-60 caractères ; nom 1-100 caractères.
const validation = enseigneSchema.safeParse({ slug: slugArg, nom: nomArg });
if (!validation.success) {
  console.error("Arguments invalides :");
  for (const issue of validation.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}
const { slug, nom } = validation.data;

async function main() {
  // Confiance opérateur : afficher l'hôte ciblé (jamais les identifiants) —
  // ce script a vocation à être pointé un jour sur la prod, l'opérateur doit
  // voir immédiatement contre quelle base il agit.
  const hote = new URL(process.env.DATABASE_URL ?? "").host || "(hôte illisible)";
  console.log(`🎯 Base ciblée : ${hote}`);

  const [inseree] = await query<{ id: number }>(
    "insert into enseignes (slug, nom) values ($1, $2) on conflict (slug) do nothing returning id",
    [slug, nom]
  );

  if (inseree) {
    console.log(`✅ Enseigne créée : « ${nom} » (slug ${slug}, id ${inseree.id}).`);
  } else {
    const [existante] = await query<{ id: number; nom: string }>(
      "select id, nom from enseignes where slug = $1",
      [slug]
    );
    if (!existante) {
      // ON CONFLICT sans ligne retrouvée ensuite : suppression concurrente
      // entre les deux requêtes — état incohérent à signaler, pas à masquer.
      throw new Error(`slug « ${slug} » ni inséré ni retrouvé en base — réessayer.`);
    }
    console.log(
      `⏭️  Le slug « ${slug} » existe déjà (id ${existante.id}, nom « ${existante.nom} ») — aucune modification (idempotent).`
    );
    if (existante.nom !== nom) {
      console.log(
        `   ⚠️  Nom demandé (« ${nom} ») ≠ nom en base (« ${existante.nom} ») : le nom en base est conservé. ` +
          `Renommer une enseigne est un geste distinct, hors de ce script.`
      );
    }
  }

  await closePool();
}

main().catch((err) => {
  console.error("❌ Échec :", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
