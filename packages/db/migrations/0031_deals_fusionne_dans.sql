-- 0031 — Fiche fusionnée dans la fiche conservée du même produit (lot SEO-2j,
-- CONTRAT-V1 §3, vingt-sixième amendement, 23/11/2026).
--
-- `fusionne_dans` : public_id de la fiche conservée, NULL par défaut. Une fiche
-- fusionnée reste en base, redirige vers la fiche conservée, sort du sitemap
-- et n'est jamais réactivée : la contrainte le garantit quel que soit le
-- chemin d'écriture (pipeline, admin).
alter table deals
  add column fusionne_dans text references deals (public_id) on delete set null,
  add constraint deals_fusionne_dans_expire check (fusionne_dans is null or statut = 'expire'),
  add constraint deals_fusionne_dans_autre check (fusionne_dans is null or fusionne_dans <> public_id);

create index deals_fusionne_dans_idx on deals (fusionne_dans) where fusionne_dans is not null;
