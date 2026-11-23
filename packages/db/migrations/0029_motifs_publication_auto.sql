-- 0029 — Motifs de non-publication automatique (lot SEO-2g, CONTRAT-V1 §3,
-- vingt-quatrième amendement, 23/11/2026).
--
-- Un brouillon écarté par la publication automatique reste en revue manuelle
-- « avec son motif » : il faut donc le stocker sur la ligne. Tableau : un
-- brouillon peut échouer sur plusieurs critères. NULL = jamais évalué, ou
-- publié. Distinct de `motif_rejet`, qui est une décision humaine montrée au
-- soumetteur.
alter table deals add column motifs_publication_auto text[];
