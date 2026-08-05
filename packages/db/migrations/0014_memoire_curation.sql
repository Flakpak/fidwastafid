-- Mémoire de curation (lot 2, plan « suppression administrative des deals »).
--
-- Bug actif corrigé ici, pas seulement une préparation : le pipeline
-- dédoublonnait sur titre+enseigne+prix_promo (insert-deals.mjs) — un deal
-- rejeté par l'admin revenait dès que le vendeur changeait son prix de
-- quelques dirhams, la décision de rejet ne survivant pas à la ligne. Cette
-- table retient la décision INDÉPENDAMMENT de la ligne `deals` : pas de FK
-- vers `deals` (même principe que `journal_audit.cible_id`, une décision
-- doit survivre à la suppression — douce ou future — de son deal d'origine).

-- Empreinte de dédoublonnage partagée entre le pipeline (apps/pipeline,
-- runtime JS séparé) et l'admin web (apps/web, TS) — une fonction SQL,
-- pas une fonction applicative dupliquée dans deux langages/runtimes, pour
-- la même raison que les prédicats partagés de dealsFilters.ts : deux
-- copies d'une même règle dérivent toujours l'une de l'autre.
--
-- Priorité au lien produit (fort, comme DEAL_DOUBLON_JOIN/`par_lien`),
-- repli sur titre+enseigne si absent (faible — inwi et similaires n'ont pas
-- de lien produit vérifiable). JAMAIS le prix : c'est précisément ce qui
-- rendait l'ancienne mémoire (le dédoublonnage de insert-deals.mjs)
-- contournable par une simple variation de prix.
create or replace function empreinte_curation(p_lien text, p_titre text, p_enseigne_id bigint)
returns text
language sql
immutable
as $$
  select case
    when p_lien is not null and length(trim(p_lien)) > 0
      then 'lien:' || lower(trim(p_lien))
    else 'titre_enseigne:' || lower(trim(p_titre)) || '|' || coalesce(p_enseigne_id::text, 'null')
  end
$$;

create table memoire_curation (
  id bigserial primary key,
  empreinte text not null,
  -- Une seule valeur possible aujourd'hui — colonne texte plutôt qu'un
  -- booléen "bloque" : une décision "publie" n'a pas de sens à mémoriser
  -- ici (rien à bloquer), mais la forme reste ouverte sans réécriture si
  -- un jour une autre décision méritait sa propre mémoire.
  decision text not null constraint memoire_curation_decision_check check (decision in ('rejete')),
  -- Référence SOUPLE (pas de FK) — voir le commentaire d'en-tête : la
  -- mémoire doit survivre à ce qu'il advient de la ligne d'origine.
  deal_origine_public_id text,
  motif text,
  decide_le timestamptz not null default now(),
  decide_par uuid references users(id),
  -- Lever une décision (jamais la supprimer, même logique que
  -- deals.supprime_le) : un produit légitimement republié par l'enseigne à
  -- un autre moment ne doit pas rester bloqué indéfiniment. null = décision
  -- active ; une date = levée, le pipeline ne la consulte plus mais
  -- l'historique reste lisible (qui a rejeté, qui a levé, pourquoi).
  levee_le timestamptz,
  levee_par uuid references users(id),
  levee_motif text
);

-- Index partiel : le pipeline ne consulte jamais que les décisions
-- ACTIVES, à chaque produit scrapé — c'est le chemin chaud.
create index memoire_curation_empreinte_active_idx on memoire_curation (empreinte) where levee_le is null;

-- Rétroactif : sans ce rattrapage, la mémoire démarre vide et le bug
-- continue de s'appliquer à tout l'historique déjà rejeté (417 lignes).
-- decide_par vient de journal_audit (entrée la plus récente pour ce deal —
-- en pratique une seule par deal rejeté, cf. diagnostic du 05/08/2026) ;
-- laissé NULL quand introuvable plutôt que deviné.
insert into memoire_curation (empreinte, decision, deal_origine_public_id, motif, decide_le, decide_par)
select
  empreinte_curation(d.lien, d.titre, d.enseigne_id),
  'rejete',
  d.public_id,
  d.motif_rejet,
  d.updated_at,
  (
    select ja.admin_id from journal_audit ja
    where ja.cible_type = 'deal' and ja.cible_id = d.public_id
    order by ja.created_at desc
    limit 1
  )
from deals d
where d.statut = 'rejete';
