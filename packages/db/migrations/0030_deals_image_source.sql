-- 0030 — URL de l'image source d'une fiche (lot SEO-2i, CONTRAT-V1 §3,
-- vingt-cinquième amendement, 23/11/2026).
--
-- Un produit qui revient garde son image si l'URL de l'image chez le marchand
-- n'a pas changé : il faut donc la mémoriser (`image_key` ne désigne que notre
-- copie). NULL = URL inconnue (toutes les fiches d'avant ce lot) : l'image
-- existante est conservée et l'URL enregistrée au premier passage.
alter table deals add column image_source text;
