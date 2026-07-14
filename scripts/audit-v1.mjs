#!/usr/bin/env node
/**
 * Audit READ-ONLY de la base v1 (projet Supabase laqwg) — CONTRAT-V1.md.
 *
 * Zéro écriture, zéro migration. Client `pg` nu (pas le SDK Supabase),
 * connexion via V1_DATABASE_URL (jamais DATABASE_URL — celle-ci vise aswbu).
 *
 * Garde-fou double :
 *  1. niveau JS : toute requête qui n'est pas un SELECT/WITH est rejetée avant envoi ;
 *  2. niveau Postgres : la session est passée en `default_transaction_read_only`,
 *     donc même un bug applicatif échouerait côté serveur.
 *
 * Usage :
 *   node scripts/audit-v1.mjs
 *   (charge packages/db/.env.migration.local lui-même — pas de source
 *    préalable requise, ça fonctionne aussi sous PowerShell)
 *
 * Écrit docs/AUDIT-V1.md.
 */

import { Client } from "pg";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "..", "docs", "AUDIT-V1.md");
const ENV_FILE_PATH = path.join(__dirname, "..", "packages", "db", ".env.migration.local");

const STATUT_ENUM_V2 = ["auto_draft", "en_attente", "publie", "rejete", "expire"];
const TYPE_ENUM_V2 = ["physique", "en_ligne", "les_deux"];
const VOTE_ENUM_V2 = ["chaud", "froid"];

/**
 * Le schéma `auth` appartient à `supabase_auth_admin` — `postgres` ne peut
 * pas y accorder `USAGE` (vérifié : `has_schema_privilege` reste `false`
 * après GRANT). Contournement tracé dans docs/fidwastafid-plan-v2.md
 * (SUIVI, exception du 2026-07-14) : vue en lecture seule exposant le
 * strict nécessaire (id, email, created_at).
 */
const AUTH_VIEW = "public.v1_auth_users_audit";

/**
 * Tables dont le count(*) = 0 est un fait établi (documenté), pas une
 * suspicion RLS/droits — exclues du contrôle de vraisemblance pour éviter
 * un faux positif permanent. `users` : BYPASSRLS prouvé actif sur cette
 * connexion (admins/deals révèlent des lignes supplémentaires une fois
 * l'attribut posé) ; un refus de droit produirait une erreur, pas un
 * résultat vide. La v1 provisionne le profil séparément de l'inscription
 * (`profil_complet` default false) et le formulaire correspondant a été
 * retiré du site — d'où une table vide malgré des comptes existants côté
 * auth.
 */
const KNOWN_LEGITIMATE_EMPTY_TABLES = new Set(["users"]);

/**
 * Parse maison, pas dotenv : lignes `CLE=valeur`, `export CLE=valeur`
 * toléré, guillemets simples/doubles optionnels, `#` = commentaire, CRLF
 * toléré. N'écrase jamais une variable déjà présente dans process.env
 * (une vraie variable d'environnement gagne toujours sur le fichier).
 */
async function loadEnvFile(filePath) {
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return; // fichier absent — les variables devront déjà être dans l'environnement
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readV1DatabaseUrl() {
  const url = process.env.V1_DATABASE_URL;
  if (!url) {
    throw new Error(
      `V1_DATABASE_URL manquant. Vérifie que ${ENV_FILE_PATH} contient une ligne V1_DATABASE_URL=...`
    );
  }
  return url;
}

/** Garde-fou niveau JS — refuse tout ce qui n'est pas un SELECT/WITH. */
function assertReadOnly(sql) {
  const stripped = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  if (!/^(select|with)\b/i.test(stripped)) {
    throw new Error(
      `Requête refusée par le garde-fou lecture seule (doit commencer par SELECT ou WITH) :\n${sql}`
    );
  }
}

let client;

async function q(sql, params) {
  assertReadOnly(sql);
  const result = await client.query(sql, params);
  return result.rows;
}

/** Requête tolérante : renvoie null si erreur (permission refusée, colonne/table absente). */
async function qSafe(sql, params) {
  try {
    return await q(sql, params);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function isErr(result) {
  return result !== null && typeof result === "object" && "error" in result && !Array.isArray(result);
}

function esc(v) {
  if (v === null || v === undefined) return "∅";
  const s = String(v);
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 200);
}

function mdTable(headers, rows) {
  if (rows.length === 0) return "_(aucune ligne)_\n";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${headers.map((h) => esc(r[h])).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}\n`;
}

const report = [];
function section(title) {
  report.push(`\n## ${title}\n`);
}
function sub(title) {
  report.push(`\n### ${title}\n`);
}
function note(text) {
  report.push(`\n_${text}_\n`);
}

// ---------------------------------------------------------------------------
// A. Schéma réel
// ---------------------------------------------------------------------------

async function auditSchema() {
  section("A — Schéma réel");

  const tables = await q(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);
  const tableNames = tables.map((t) => t.table_name);
  note(`${tableNames.length} table(s) trouvée(s) dans public : ${tableNames.join(", ")}`);

  const columns = await q(`
    select table_name, column_name, data_type, is_nullable, column_default, ordinal_position
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `);

  const columnsByTable = new Map();
  for (const c of columns) {
    if (!columnsByTable.has(c.table_name)) columnsByTable.set(c.table_name, new Set());
    columnsByTable.get(c.table_name).add(c.column_name);
  }

  for (const t of tableNames) {
    sub(`Colonnes — \`${t}\``);
    const rows = columns.filter((c) => c.table_name === t);
    report.push(
      mdTable(
        ["column_name", "data_type", "is_nullable", "column_default"],
        rows.map((r) => ({
          column_name: r.column_name,
          data_type: r.data_type,
          is_nullable: r.is_nullable,
          column_default: r.column_default,
        }))
      )
    );
  }

  const constraints = await q(`
    select tc.table_name, tc.constraint_name, tc.constraint_type,
           kcu.column_name,
           ccu.table_name as foreign_table_name, ccu.column_name as foreign_column_name
    from information_schema.table_constraints tc
    left join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    left join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.table_schema = 'public'
    order by tc.table_name, tc.constraint_type, tc.constraint_name
  `);
  sub("Contraintes (PK / FK / UNIQUE)");
  report.push(
    mdTable(
      ["table_name", "constraint_type", "column_name", "foreign_table_name", "foreign_column_name"],
      constraints
    )
  );

  const indexes = await q(`
    select tablename, indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
    order by tablename, indexname
  `);
  sub("Index");
  report.push(mdTable(["tablename", "indexname", "indexdef"], indexes));

  return { tableNames, columnsByTable };
}

// ---------------------------------------------------------------------------
// B. Volumétrie
// ---------------------------------------------------------------------------

async function auditVolumetry(tableNames) {
  section("B — Volumétrie");
  const rows = [];
  const rowCounts = new Map();
  for (const t of tableNames) {
    const r = await q(`select count(*)::bigint as n from "${t}"`);
    const n = Number(r[0].n);
    rows.push({ table: t, n });
    rowCounts.set(t, n);
  }
  report.push(mdTable(["table", "n"], rows));

  if (rowCounts.get("users") === 0) {
    note(
      "`public.users` à 0 ligne est un FAIT établi, pas une suspicion : BYPASSRLS est prouvé actif sur cette connexion (admins/deals ci-dessus révèlent des lignes supplémentaires grâce à cet attribut), et un refus de droit produirait une erreur, pas un résultat vide. La v1 provisionne le profil séparément de l'inscription (`profil_complet` default false) ; le formulaire correspondant a été retiré du site."
    );
  }

  const authView = await qSafe(`select count(*)::bigint as n from ${AUTH_VIEW}`);
  if (isErr(authView)) {
    note(`${AUTH_VIEW} non accessible : ${authView.error}`);
  } else {
    report.push(
      mdTable(
        ["table", "n"],
        [{ table: `${AUTH_VIEW} (vue en lecture seule sur auth.users, id/email/created_at — cf. SUIVI 2026-07-14)`, n: authView[0].n }]
      )
    );
  }

  return rowCounts;
}

/**
 * Candidats de clé étrangère par convention de nommage (aucune FK n'est
 * déclarée en base — cf. section A, "Contraintes" vide). Une colonne
 * `xxx_id` est candidate si une table `xxx`, `xxxs` ou `xxxes` existe.
 */
function findFkCandidates(tableNames, columnsByTable) {
  const candidates = [];
  for (const table of tableNames) {
    const cols = columnsByTable.get(table) ?? new Set();
    for (const col of cols) {
      const m = col.match(/^(.+)_id$/i);
      if (!m) continue;
      const base = m[1];
      const target = [`${base}s`, base, `${base}es`].find((t) => tableNames.includes(t) && t !== table);
      if (target) candidates.push({ fromTable: table, fromColumn: col, toTable: target });
    }
  }
  return candidates;
}

/**
 * Contrôle de vraisemblance : une table à count(*) = 0 alors qu'une autre
 * table la référence (par convention de nommage) avec des valeurs non
 * nulles n'est pas un fait fiable sur les données — c'est la signature
 * typique d'une Row Level Security ou de droits insuffisants côté rôle de
 * lecture. Signalé comme suspicion, jamais comme un chiffre acquis.
 */
async function auditPlausibility(tableNames, columnsByTable, rowCounts) {
  const lines = [];
  const suspectTables = new Set();
  for (const { fromTable, fromColumn, toTable } of findFkCandidates(tableNames, columnsByTable)) {
    if (KNOWN_LEGITIMATE_EMPTY_TABLES.has(toTable)) continue;
    if ((rowCounts.get(toTable) ?? 0) !== 0) continue;
    const r = await q(`select count(*)::bigint as n from "${fromTable}" where "${fromColumn}" is not null`);
    const nonNullRefs = Number(r[0].n);
    if (nonNullRefs > 0) {
      suspectTables.add(toTable);
      lines.push(
        `- ⚠ **SUSPICION RLS / droits insuffisants — chiffres non fiables** : \`${toTable}\` renvoie count(*) = 0 alors que \`${fromTable}.${fromColumn}\` la référence avec ${nonNullRefs} valeur(s) non nulle(s). Le 0 sur \`${toTable}\` n'est probablement pas un fait sur les données.`
      );
    }
  }
  return { lines, suspectTables };
}

// ---------------------------------------------------------------------------
// C. Distributions
// ---------------------------------------------------------------------------

async function distribution(table, column, has) {
  if (!has(table, column)) {
    note(`\`${table}.${column}\` absente — section ignorée`);
    return;
  }
  const rows = await q(`
    select "${column}"::text as valeur, count(*)::bigint as n
    from "${table}"
    group by "${column}"
    order by n desc
  `);
  report.push(mdTable(["valeur", "n"], rows));
}

async function auditDistributions(has) {
  section("C — Distributions");

  sub("deals.statut");
  await distribution("deals", "statut", has);

  sub("deals.categorie");
  await distribution("deals", "categorie", has);

  sub("deals.ville");
  await distribution("deals", "ville", has);

  sub("deals.type");
  await distribution("deals", "type", has);

  sub("deals.magasin (brut)");
  await distribution("deals", "magasin", has);

  if (has("deals", "magasin")) {
    sub("deals.magasin normalisé — lower(btrim(magasin))");
    const rows = await q(`
      select lower(btrim(magasin)) as valeur, count(*)::bigint as n
      from deals
      group by lower(btrim(magasin))
      order by n desc
    `);
    report.push(mdTable(["valeur", "n"], rows));
    const nullVide = await q(`
      select
        count(*) filter (where magasin is null)::bigint as nb_null,
        count(*) filter (where magasin is not null and btrim(magasin) = '')::bigint as nb_vide
      from deals
    `);
    report.push(mdTable(["nb_null", "nb_vide"], nullVide));
  }

  sub("votes.type");
  await distribution("votes", "type", has);
}

// ---------------------------------------------------------------------------
// D. Intégrité référentielle
// ---------------------------------------------------------------------------

async function auditIntegrity(has, suspectTables) {
  section("D — Intégrité référentielle");
  if (suspectTables.size > 0) {
    note(
      `⚠ ${[...suspectTables].map((t) => `\`${t}\``).join(", ")} suspecté(s) RLS/droits insuffisants (cf. ANOMALIES en fin de rapport) — les comptages d'orphelins impliquant ces tables ci-dessous sont bruts, à lire avec cette réserve.`
    );
  }
  const results = {};

  if (has("votes", "deal_id") && has("deals", "id")) {
    const r = await q(`
      select count(*)::bigint as n from votes v
      where not exists (select 1 from deals d where d.id = v.deal_id)
    `);
    results.votesOrphanDeal = Number(r[0].n);
  }
  if (has("votes", "user_id") && has("users", "id")) {
    const r = await q(`
      select count(*)::bigint as n from votes v
      where not exists (select 1 from users u where u.id = v.user_id)
    `);
    results.votesOrphanUser = Number(r[0].n);
  }
  if (has("commentaires", "deal_id") && has("deals", "id")) {
    const r = await q(`
      select count(*)::bigint as n from commentaires c
      where not exists (select 1 from deals d where d.id = c.deal_id)
    `);
    results.commentairesOrphanDeal = Number(r[0].n);
  }
  if (has("commentaires", "user_id") && has("users", "id")) {
    const r = await q(`
      select count(*)::bigint as n from commentaires c
      where not exists (select 1 from users u where u.id = c.user_id)
    `);
    results.commentairesOrphanUser = Number(r[0].n);
  }
  if (has("deals", "user_id")) {
    const r = await q(`select count(*)::bigint as n from deals where user_id is null`);
    results.dealsUserIdNull = Number(r[0].n);
    if (has("users", "id")) {
      const r2 = await q(`
        select count(*)::bigint as n from deals d
        where d.user_id is not null and not exists (select 1 from users u where u.id = d.user_id)
      `);
      results.dealsUserIdOrphan = Number(r2[0].n);
    }
  }

  report.push(
    mdTable(
      ["vérification", "n"],
      Object.entries(results).map(([k, v]) => ({ vérification: k, n: v }))
    )
  );
  note(
    "Les vérifications *OrphanUser / dealsUserIdOrphan ci-dessus mesurent l'existence dans `users`, vide par conception (cf. section B) — sans rapport avec la résolution via la vue auth ci-dessous, qui montre les user_id réellement rattachés à un compte."
  );

  sub(`Résolution des user_id via ${AUTH_VIEW}`);
  note(
    `Le schéma `+"`auth`"+` n'est pas accessible directement (GRANT USAGE impossible pour `+"`postgres`"+` sur Supabase — schéma détenu par `+"`supabase_auth_admin`"+`). Contournement : `+"`"+AUTH_VIEW+"`"+` (id, email, created_at), en lecture seule — cf. docs/fidwastafid-plan-v2.md, SUIVI, exception du 2026-07-14.`
  );

  const viewCountRes = await qSafe(`select count(*)::bigint as n from ${AUTH_VIEW}`);
  if (isErr(viewCountRes)) {
    note(`${AUTH_VIEW} non accessible : ${viewCountRes.error}`);
    return;
  }
  const viewCount = Number(viewCountRes[0].n);
  report.push(mdTable(["vérification", "n"], [{ vérification: `COUNT(*) ${AUTH_VIEW}`, n: viewCount }]));

  sub("user_id résolus dans la vue, par table");
  const resolutionRows = [];
  for (const [table, column] of [
    ["deals", "user_id"],
    ["votes", "user_id"],
    ["commentaires", "user_id"],
  ]) {
    if (!has(table, column)) continue;
    const r = await q(`
      select count(*)::bigint as n from "${table}" t
      where t."${column}" is not null and exists (select 1 from ${AUTH_VIEW} a where a.id = t."${column}")
    `);
    resolutionRows.push({ table, colonne: column, user_id_non_nuls_resolus: Number(r[0].n) });
  }
  report.push(mdTable(["table", "colonne", "user_id_non_nuls_resolus"], resolutionRows));

  sub("user_id distincts référencés (deals ∪ votes ∪ commentaires)");
  const unionParts = [];
  if (has("deals", "user_id")) unionParts.push(`select user_id from deals where user_id is not null`);
  if (has("votes", "user_id")) unionParts.push(`select user_id from votes where user_id is not null`);
  if (has("commentaires", "user_id")) unionParts.push(`select user_id from commentaires where user_id is not null`);

  if (unionParts.length > 0) {
    const distinctUsers = await q(`
      with all_ids as (${unionParts.join(" union ")})
      select
        u.user_id,
        (select count(*)::bigint from deals d where d.user_id = u.user_id) as nb_deals,
        (select count(*)::bigint from votes v where v.user_id = u.user_id) as nb_votes,
        (select count(*)::bigint from commentaires c where c.user_id = u.user_id) as nb_commentaires,
        case
          when exists (select 1 from ${AUTH_VIEW} a where a.id = u.user_id and a.email is not null)
          then 'oui' else 'non'
        end as a_un_email
      from all_ids u
      order by nb_deals desc, nb_votes desc, nb_commentaires desc
    `);
    report.push(mdTable(["user_id", "nb_deals", "nb_votes", "nb_commentaires", "a_un_email"], distinctUsers));
  }
}

// ---------------------------------------------------------------------------
// E. Votes — le point critique
// ---------------------------------------------------------------------------

async function auditVotes(has) {
  section("E — Votes (point critique)");

  if (!has("votes", "deal_id") || !has("votes", "user_id")) {
    note("votes.deal_id / votes.user_id absents — section ignorée");
    return;
  }

  sub("Doublons (deal_id, user_id)");
  const dupStats = await q(`
    select count(*)::bigint as nb_couples_dupliques, coalesce(max(n), 0)::bigint as max_doublons
    from (
      select deal_id, user_id, count(*) as n
      from votes
      group by deal_id, user_id
      having count(*) > 1
    ) x
  `);
  report.push(mdTable(["nb_couples_dupliques", "max_doublons"], dupStats));

  const worst = await q(`
    select deal_id, user_id, count(*)::bigint as n
    from votes
    group by deal_id, user_id
    having count(*) > 1
    order by n desc
    limit 20
  `);
  sub("20 pires cas");
  report.push(mdTable(["deal_id", "user_id", "n"], worst));

  if (has("deals", "score") && has("votes", "type")) {
    sub("Score stocké vs recalculé (chaud - froid)");
    const divergenceStats = await q(`
      with recalc as (
        select d.id, d.score as score_stocke,
               coalesce(sum(case when v.type = 'chaud' then 1 when v.type = 'froid' then -1 else 0 end), 0)::bigint as score_recalcule
        from deals d
        left join votes v on v.deal_id = d.id
        group by d.id, d.score
      )
      select count(*)::bigint as nb_divergents,
             coalesce(max(abs(score_stocke - score_recalcule)), 0)::bigint as divergence_max
      from recalc
      where score_stocke <> score_recalcule
    `);
    report.push(mdTable(["nb_divergents", "divergence_max"], divergenceStats));

    const examples = await q(`
      with recalc as (
        select d.id, d.score as score_stocke,
               coalesce(sum(case when v.type = 'chaud' then 1 when v.type = 'froid' then -1 else 0 end), 0)::bigint as score_recalcule
        from deals d
        left join votes v on v.deal_id = d.id
        group by d.id, d.score
      )
      select id, score_stocke, score_recalcule, (score_stocke - score_recalcule) as ecart
      from recalc
      where score_stocke <> score_recalcule
      order by abs(score_stocke - score_recalcule) desc
      limit 10
    `);
    sub("10 exemples de divergence");
    report.push(mdTable(["id", "score_stocke", "score_recalcule", "ecart"], examples));
  } else {
    note("deals.score ou votes.type absent — comparaison de score ignorée");
  }
}

// ---------------------------------------------------------------------------
// F. Images
// ---------------------------------------------------------------------------

async function auditImages(has) {
  section("F — Images (deals.photo_url)");
  if (!has("deals", "photo_url")) {
    note("deals.photo_url absente — section ignorée");
    return;
  }

  const base = await q(`
    select
      count(*) filter (where photo_url is null)::bigint as nb_null,
      count(*) filter (where photo_url is not null and btrim(photo_url) = '')::bigint as nb_vide,
      count(*) filter (where photo_url like 'data:%')::bigint as nb_data_uri,
      count(*) filter (where photo_url like 'http://%')::bigint as nb_http,
      count(*) filter (where photo_url like 'https://%')::bigint as nb_https,
      count(*) filter (
        where photo_url is not null and btrim(photo_url) <> ''
          and photo_url not like 'data:%' and photo_url not like 'http://%' and photo_url not like 'https://%'
      )::bigint as nb_autre,
      max(length(photo_url))::bigint as longueur_max
    from deals
  `);
  report.push(mdTable(["nb_null", "nb_vide", "nb_data_uri", "nb_http", "nb_https", "nb_autre", "longueur_max"], base));

  sub("TOP 15 domaines (https)");
  const domains = await q(`
    select substring(photo_url from '^https?://([^/]+)') as host, count(*)::bigint as n
    from deals
    where photo_url like 'https://%'
    group by 1
    order by n desc
    limit 15
  `);
  report.push(mdTable(["host", "n"], domains));
}

// ---------------------------------------------------------------------------
// G. Contraintes de forme
// ---------------------------------------------------------------------------

function lengthBucketSql(table, column, whereExtra = "") {
  return `
    select
      case
        when "${column}" is null then 'NULL'
        when length("${column}") = 0 then '0'
        when length("${column}") <= 20 then '1-20'
        when length("${column}") <= 50 then '21-50'
        when length("${column}") <= 100 then '51-100'
        when length("${column}") <= 200 then '101-200'
        else '200+'
      end as tranche,
      count(*)::bigint as n
    from "${table}"
    ${whereExtra}
    group by 1
    order by min(length("${column}")) asc nulls first
  `;
}

async function auditShape(has) {
  section("G — Contraintes de forme");

  for (const [table, column] of [
    ["deals", "titre"],
    ["deals", "description"],
    ["users", "pseudo"],
    ["commentaires", "contenu"],
  ]) {
    sub(`${table}.${column}`);
    if (!has(table, column)) {
      note(`\`${table}.${column}\` absente — section ignorée`);
      continue;
    }
    const max = await q(`select max(length("${column}"))::bigint as longueur_max from "${table}"`);
    report.push(mdTable(["longueur_max"], max));
    const dist = await q(lengthBucketSql(table, column));
    report.push(mdTable(["tranche", "n"], dist));
  }

  sub("deals.titre sans caractère [a-zA-Z0-9] (slug ASCII vide)");
  if (has("deals", "titre")) {
    const count = await q(`
      select count(*)::bigint as n from deals where titre is not null and titre !~ '[a-zA-Z0-9]'
    `);
    report.push(mdTable(["n"], count));
    const examples = await q(`
      select id, titre from deals where titre is not null and titre !~ '[a-zA-Z0-9]' limit 10
    `);
    report.push(mdTable(["id", "titre"], examples));
  } else {
    note("deals.titre absente — section ignorée");
  }

  sub("Pseudos en doublon (users.pseudo)");
  if (has("users", "pseudo")) {
    const dupes = await q(`
      select pseudo, count(*)::bigint as n from users group by pseudo having count(*) > 1 order by n desc
    `);
    report.push(mdTable(["pseudo", "n"], dupes));
  } else {
    note("users.pseudo absente — section ignorée");
  }

  sub("deals.prix_normal NULL ou = 0");
  if (has("deals", "prix_normal")) {
    const r = await q(`
      select
        count(*) filter (where prix_normal is null)::bigint as nb_null,
        count(*) filter (where prix_normal = 0)::bigint as nb_zero
      from deals
    `);
    report.push(mdTable(["nb_null", "nb_zero"], r));
  } else {
    note("deals.prix_normal absente — section ignorée");
  }

  sub("Incohérences type / ville / lien");
  if (has("deals", "type")) {
    const typeValues = await q(`select distinct type from deals where type is not null`);
    const values = typeValues.map((r) => r.type);
    note(`Valeurs réelles trouvées pour deals.type : ${values.join(", ") || "(aucune)"}`);

    if (has("deals", "ville")) {
      const enLigneAvecVille = await q(`
        select count(*)::bigint as n from deals where type ilike '%ligne%' and ville is not null
      `);
      report.push(mdTable(["cas", "n"], [{ cas: "type contient 'ligne' avec ville non nulle", n: enLigneAvecVille[0].n }]));

      const physiqueSansVille = await q(`
        select count(*)::bigint as n from deals where type ilike 'physique' and ville is null
      `);
      report.push(mdTable(["cas", "n"], [{ cas: "type = 'physique' sans ville", n: physiqueSansVille[0].n }]));
    }
    if (has("deals", "lien")) {
      const enLigneSansLien = await q(`
        select count(*)::bigint as n from deals where type ilike '%ligne%' and (lien is null or btrim(lien) = '')
      `);
      report.push(mdTable(["cas", "n"], [{ cas: "type contient 'ligne' sans lien", n: enLigneSansLien[0].n }]));
    }
  } else {
    note("deals.type absente — section ignorée");
  }
}

// ---------------------------------------------------------------------------
// H. Temps
// ---------------------------------------------------------------------------

async function auditTime(has) {
  section("H — Temps");
  if (has("deals", "created_at")) {
    const minMax = await q(`select min(created_at) as min_created_at, max(created_at) as max_created_at from deals`);
    report.push(mdTable(["min_created_at", "max_created_at"], minMax));
    const nullCount = await q(`select count(*)::bigint as n from deals where created_at is null`);
    report.push(mdTable(["cas", "n"], [{ cas: "created_at NULL", n: nullCount[0].n }]));
  } else {
    note("deals.created_at absente — section ignorée");
  }
  if (has("deals", "date_fin")) {
    const pastCount = await q(`select count(*)::bigint as n from deals where date_fin < now()`);
    report.push(mdTable(["cas", "n"], [{ cas: "date_fin dans le passé", n: pastCount[0].n }]));
  } else {
    note("deals.date_fin absente — section ignorée");
  }
}

// ---------------------------------------------------------------------------
// I. Colonnes démographiques — liste seule, jamais de valeurs (loi 09-08)
// ---------------------------------------------------------------------------

async function auditDemographics(columnsByTable) {
  section("I — Colonnes démographiques (users) — liste seule, valeurs hors périmètre (loi 09-08)");
  const userColumns = [...(columnsByTable.get("users") ?? [])];
  const keywords = /genre|sexe|age|situation|famil|enfant/i;
  const suspected = userColumns.filter((c) => keywords.test(c));
  report.push(mdTable(["colonne_suspectee_demographique"], suspected.map((c) => ({ colonne_suspectee_demographique: c }))));
  note(
    "Aucune valeur de ces colonnes n'a été lue ni comptée par ce script. Liste établie par correspondance de nom uniquement — à confirmer manuellement avant toute décision d'exclusion ETL."
  );
}

// ---------------------------------------------------------------------------
// Anomalies — synthèse factuelle, calculée à partir des résultats ci-dessus
// ---------------------------------------------------------------------------

async function auditAnomalies(has, suspicionLines, suspectTables) {
  section("ANOMALIES — ce qui bloquera l'insertion en v2");
  const lines = [...suspicionLines];

  if (has("deals", "statut")) {
    const rows = await q(`select distinct statut from deals where statut is not null`);
    const horsEnum = rows.map((r) => r.statut).filter((v) => !STATUT_ENUM_V2.includes(v));
    if (horsEnum.length > 0) lines.push(`- deals.statut hors enum v2 (${STATUT_ENUM_V2.join("|")}) : ${horsEnum.join(", ")}`);
  }
  if (has("deals", "type")) {
    const rows = await q(`select distinct type from deals where type is not null`);
    const horsEnum = rows.map((r) => r.type).filter((v) => !TYPE_ENUM_V2.includes(v));
    if (horsEnum.length > 0) lines.push(`- deals.type hors enum v2 (${TYPE_ENUM_V2.join("|")}) : ${horsEnum.join(", ")}`);
  }
  if (has("votes", "type")) {
    const rows = await q(`select distinct type from votes where type is not null`);
    const horsEnum = rows.map((r) => r.type).filter((v) => !VOTE_ENUM_V2.includes(v));
    if (horsEnum.length > 0) lines.push(`- votes.type hors enum v2 (${VOTE_ENUM_V2.join("|")}) : ${horsEnum.join(", ")}`);
  }
  if (has("votes", "deal_id") && has("votes", "user_id")) {
    const dup = await q(`
      select count(*)::bigint as n from (
        select deal_id, user_id from votes group by deal_id, user_id having count(*) > 1
      ) x
    `);
    if (Number(dup[0].n) > 0) lines.push(`- votes : ${dup[0].n} couple(s) (deal_id, user_id) en double — violerait une contrainte unique (deal_id, user_id) en v2`);
  }
  if (has("users", "pseudo")) {
    const dup = await q(`select count(*)::bigint as n from (select pseudo from users group by pseudo having count(*) > 1) x`);
    if (Number(dup[0].n) > 0) lines.push(`- users.pseudo : ${dup[0].n} valeur(s) en double`);
  }
  if (has("votes", "deal_id") && has("deals", "id") && !suspectTables.has("deals")) {
    const r = await q(`select count(*)::bigint as n from votes v where not exists (select 1 from deals d where d.id = v.deal_id)`);
    if (Number(r[0].n) > 0) lines.push(`- votes : ${r[0].n} ligne(s) orpheline(s) (deal_id introuvable dans deals)`);
  }
  if (has("commentaires", "deal_id") && has("deals", "id") && !suspectTables.has("deals")) {
    const r = await q(`select count(*)::bigint as n from commentaires c where not exists (select 1 from deals d where d.id = c.deal_id)`);
    if (Number(r[0].n) > 0) lines.push(`- commentaires : ${r[0].n} ligne(s) orpheline(s) (deal_id introuvable dans deals)`);
  }
  if (has("deals", "user_id") && has("users", "id") && !suspectTables.has("users")) {
    const r = await q(`select count(*)::bigint as n from deals d where d.user_id is not null and not exists (select 1 from users u where u.id = d.user_id)`);
    if (Number(r[0].n) > 0) lines.push(`- deals : ${r[0].n} ligne(s) avec user_id introuvable dans users`);
  }
  if (has("votes", "user_id") && has("users", "id") && !suspectTables.has("users")) {
    const r = await q(`select count(*)::bigint as n from votes v where v.user_id is not null and not exists (select 1 from users u where u.id = v.user_id)`);
    if (Number(r[0].n) > 0) lines.push(`- votes : ${r[0].n} ligne(s) avec user_id introuvable dans users`);
  }
  if (has("commentaires", "user_id") && has("users", "id") && !suspectTables.has("users")) {
    const r = await q(`select count(*)::bigint as n from commentaires c where c.user_id is not null and not exists (select 1 from users u where u.id = c.user_id)`);
    if (Number(r[0].n) > 0) lines.push(`- commentaires : ${r[0].n} ligne(s) avec user_id introuvable dans users`);
  }

  if (lines.length === 0) {
    report.push("_Aucune anomalie bloquante détectée par les vérifications ci-dessus._\n");
  } else {
    report.push(lines.join("\n") + "\n");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await loadEnvFile(ENV_FILE_PATH);
  const url = readV1DatabaseUrl();
  client = new Client({ connectionString: url });
  await client.connect();
  // Garde-fou niveau Postgres : la session refuse toute écriture, même en cas
  // de bug applicatif qui laisserait passer une requête non-SELECT.
  await client.query(`SET default_transaction_read_only = on`);

  report.push(`# AUDIT-V1 — base v1 (laqwg)\n`);
  report.push(`_Généré le ${new Date().toISOString()} par scripts/audit-v1.mjs — lecture seule, aucune écriture effectuée._\n`);

  const { tableNames, columnsByTable } = await auditSchema();
  const has = (table, column) => columnsByTable.get(table)?.has(column) ?? false;

  const rowCounts = await auditVolumetry(tableNames);
  const { lines: suspicionLines, suspectTables } = await auditPlausibility(tableNames, columnsByTable, rowCounts);
  await auditDistributions(has);
  await auditIntegrity(has, suspectTables);
  await auditVotes(has);
  await auditImages(has);
  await auditShape(has);
  await auditTime(has);
  await auditDemographics(columnsByTable);
  await auditAnomalies(has, suspicionLines, suspectTables);

  await writeFile(OUTPUT_PATH, report.join("\n"), "utf8");
  console.log(`Rapport écrit : ${OUTPUT_PATH}`);

  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  if (client) await client.end().catch(() => {});
  process.exit(1);
});
