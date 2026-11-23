-- 0027 — Fraîcheur : deals.vu_le et trace de passage par run (lot SEO-2e,
-- CONTRAT-V1 §3, vingt-troisième amendement, 23/11/2026).
--
-- deals.vu_le : dernière fois qu'un scraper a retrouvé le deal à la source.
-- Valeur initiale : now() pour les deals publiés actifs (période de grâce :
-- personne ne sait quand ils ont été vus pour la dernière fois), created_at
-- pour les autres. `default now()` couvre toute insertion future, pipeline
-- comme soumission. updated_at n'est pas touché.
--
-- Pas d'index (enseigne_id, vu_le) : aucune requête de ce lot ne filtre sur
-- vu_le (l'écriture cible titre + enseigne + prix). Un index sur une colonne
-- réécrite chaque jour empêcherait en plus les mises à jour HOT. À
-- reconsidérer au lot SEO-2f, sur ses requêtes réelles.
--
-- pipeline_runs : colonnes typées plutôt qu'un JSON ou une table dédiée. Il
-- y a déjà une ligne par source et par run, avec RLS ; la règle du run
-- « complet » (médiane de elements_lus sur 7 runs) s'écrit directement en
-- SQL. NULL = non mesuré (`injoignable`, et tout l'historique d'avant ce lot).
--
-- Transaction : assurée par le runner (packages/db/src/migrate.ts).

alter table deals add column vu_le timestamptz;

update deals d
   set vu_le = case
     when d.statut = 'publie'
      and d.supprime_le is null
      and (d.date_fin is null or d.date_fin >= (now() at time zone 'Africa/Casablanca')::date)
     then now()
     else d.created_at
   end;

alter table deals
  alter column vu_le set default now(),
  alter column vu_le set not null;

alter table pipeline_runs
  add column elements_lus integer check (elements_lus >= 0),
  add column plafond_atteint boolean,
  add column interrompu boolean,
  add column vus integer check (vus >= 0);
