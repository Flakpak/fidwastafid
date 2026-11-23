-- 0028 — Expiration des deals de sources hors cron et des soumissions
-- anciennes (lot SEO-2e, CONTRAT-V1 §3, vingt-troisième amendement).
--
-- Liste figée par public_id, relevée en production le 23/11/2026 :
--   Decathlon  23 — retirée du cron le 15/08/2026 ;
--   Lemobilier  2 — scraper jamais fusionné sur main, un seul run le 15/08 ;
--   Soumissions 8 — publiées sans date de fin depuis plus de 30 jours.
--
-- Ces 33 deals gardent leur URL en HTTP 200 avec le bandeau expiré (§1). Tous
-- ont une trace de publication (`deals_protection.protege`) : ils restent
-- indexables et dans sitemap-deals.
--
-- Transaction : assurée par le runner (packages/db/src/migrate.ts).

create temporary table expiration_0028 (public_id text primary key, groupe text not null) on commit drop;

insert into expiration_0028 (public_id, groupe)
select id, 'decathlon' from unnest(array[
  '2zcqxh9n6a', '7hdcj776yw', '8ghwqhncxe', 'c5pthkevfp', 'chpxkedxvy', 'd7curvedge',
  'd8cfqunu98', 'e8eihv5h84', 'f6qdm9yw55', 'fvhmdy56ay', 'geidep36nb', 'hhj4uirhzh',
  'j67bfy2akc', 'ku4wsyk2xw', 'mctdc7xa6m', 'pcjz48sb27', 'qdiwd6qcf8', 'qs2y6zw9iw',
  'uai97q5cgv', 'xsegv3b7we', 'yh95xhiaut', 'ysw8n2n77w', 'ze2rm49pc4'
]) as id
union all
select id, 'lemobilier' from unnest(array['g9ze7dc3tf', 'jx84t5uxhn']) as id
union all
select id, 'soumission' from unnest(array[
  'cz9unyendy', 'gygr5z7qyn', 'ic3qafz7gq', 'rjxdipyt22',
  'sqxnwrqd5w', 'vsu4rcxmv8', 'xdhvu67p2d', 'xkqftkzzfh'
]) as id;

update deals d
   set statut = 'expire', updated_at = now()
  from expiration_0028 x
 where d.public_id = x.public_id
   and d.statut = 'publie'
   and d.supprime_le is null;

-- Contrôle : 23 + 2 + 8 lignes passées en expire par CETTE transaction, sinon
-- exception et annulation. Seul cas toléré, comme 0024 : aucun des 33
-- public_id n'existe (base vierge du job CI integration).
do $$
declare
  existants integer;
  nb_decathlon integer;
  nb_lemobilier integer;
  nb_soumissions integer;
begin
  select count(*),
         count(*) filter (where x.groupe = 'decathlon' and d.statut = 'expire' and d.updated_at = now()),
         count(*) filter (where x.groupe = 'lemobilier' and d.statut = 'expire' and d.updated_at = now()),
         count(*) filter (where x.groupe = 'soumission' and d.statut = 'expire' and d.updated_at = now())
    into existants, nb_decathlon, nb_lemobilier, nb_soumissions
    from expiration_0028 x
    join deals d on d.public_id = x.public_id;

  if existants = 0 then
    raise notice '0028 : aucun des 33 deals présent (base sans données de production) — rien à expirer';
    return;
  end if;

  if nb_decathlon <> 23 or nb_lemobilier <> 2 or nb_soumissions <> 8 then
    raise exception '0028 : decathlon %/23, lemobilier %/2, soumissions %/8 — migration annulée',
      nb_decathlon, nb_lemobilier, nb_soumissions;
  end if;
end
$$;
