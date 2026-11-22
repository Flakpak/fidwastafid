-- 0023 — Décodage des entités HTML restées dans deals.titre (lot SEO-2, 22/11/2026).
--
-- Mesuré en production avant correctif (lecture seule, 22/11/2026, motif
-- '&[a-zA-Z#0-9]+;') : 29 titres concernés, deux entités distinctes et
-- seulement deux :
--   &rsquo;  ×26 occurrences (25 titres, Aswak Assalam) → ’ (U+2019)
--   &#038;   × 5 occurrences  (5 titres, Aswak Assalam + AB Maroc) → &
-- Toutes viennent des API WooCommerce, qui renvoient le nom produit encodé.
-- Le pipeline les décode désormais à l'insertion (apps/pipeline/
-- entites-html.mjs, appelé par insert-deals.mjs) ; cette migration corrige
-- le stock existant.
--
-- Transaction : assurée par le runner (packages/db/src/migrate.ts,
-- withTransaction) — pas de BEGIN/COMMIT ici, un COMMIT dans le fichier
-- validerait la transaction du runner avant l'insertion dans
-- schema_migrations.
--
-- Seule la colonne `titre` change. `updated_at` n'est PAS touché : aucun
-- trigger sur `deals` ne l'exige (pg_trigger vérifié le 22/11/2026).
--
-- Le slug n'est pas stocké (CONTRAT-V1 §1) : il est recalculé depuis le
-- titre, et l'ancienne URL (`...-d-rsquo-...`) redirige vers la nouvelle,
-- puisque la résolution se fait sur le public_id.

update deals
   set titre = replace(titre, '&rsquo;', chr(8217))
 where titre like '%&rsquo;%';

update deals
   set titre = replace(titre, '&#038;', '&')
 where titre like '%&#038;%';

-- Contrôle final : doit trouver 0 ligne. Sinon, exception → toute la
-- transaction du runner est annulée (titres non modifiés, 0023 non
-- enregistrée dans schema_migrations) — jamais un succès partiel.
do $$
declare
  restants integer;
begin
  select count(*) into restants from deals where titre ~ '&[a-zA-Z#0-9]+;';
  if restants > 0 then
    raise exception '0023 : % titre(s) portent encore une entité HTML — migration annulée', restants;
  end if;
end
$$;
