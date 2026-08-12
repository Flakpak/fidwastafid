-- pipeline_runs — historique persisté du pipeline de scraping, par source et
-- par run (lot supervision du 12/08/2026).
--
-- Pourquoi : le contrôle existant (pipeline-quotidien.yml) ne teste que le
-- FICHIER produit par le scraper, jamais l'INSERTION nette en base — il ne
-- distingue donc pas trois états très différents : une source injoignable
-- (panne technique, ne se résout pas seule — bestmark, 10 runs consécutifs
-- de `fetch failed`), une source joignable mais sans rien d'assez remisé
-- (état de marché normal), et une source qui extrait des produits déjà tous
-- en base (catalogue figé chez le marchand). Les logs GitHub Actions et
-- artefacts expirent ; cette table ne le fait pas.
--
-- `cause` résume les quatre compteurs en une classification actionnable :
--   'injoignable'  — aucun fichier d'archive produit (extraits=retenus=
--                    inseres=doublons=0). Écrite par enregistrer-echec-
--                    scraping.mjs, JAMAIS par insert-deals.mjs (qui ne
--                    tourne pas dans ce cas — rien à insérer).
--   'rien_retenu'  — extraits > 0, mais retenus = 0 (rejeté par validation,
--                    seuil de remise, enseigne inconnue ou mémoire de
--                    curation — collectivement, pas seulement la remise).
--   'deja_en_base' — retenus > 0, inseres = 0 (tout ce qui a survécu au
--                    filtrage était déjà en base : doublons = retenus).
--   'ok'           — au moins une insertion réelle.
-- Écrite par insert-deals.mjs pour 'rien_retenu'/'deja_en_base'/'ok' (elle a
-- déjà la connexion ouverte et les quatre compteurs sous la main) ; par
-- enregistrer-echec-scraping.mjs pour 'injoignable' (insert-deals.mjs ne
-- s'exécute jamais dans ce cas).
create table pipeline_runs (
  id bigint generated always as identity primary key,
  source text not null,
  run_id bigint not null,
  cause text not null check (cause in ('injoignable', 'rien_retenu', 'deja_en_base', 'ok')),
  extraits integer not null default 0,
  retenus integer not null default 0,
  inseres integer not null default 0,
  doublons integer not null default 0,
  cree_le timestamptz not null default now()
);

-- Lecture par source, plus récent d'abord — c'est la seule requête que ce
-- lot exécute (historique par source, calcul de série de runs consécutifs).
create index pipeline_runs_source_cree_le_idx on pipeline_runs (source, cree_le desc);

-- Même décision que 0008/0011 : canal PostgREST non utilisé par l'app
-- (accès exclusif par connexion Postgres directe, CONTRAT-V1 §7) — RLS sans
-- policy ferme ce canal pour anon/authenticated sans gêner le rôle
-- propriétaire (DATABASE_URL), qui continue de tout voir/écrire. SURTOUT PAS
-- de FORCE ROW LEVEL SECURITY, même raison qu'en 0008.
alter table public.pipeline_runs enable row level security;
