-- 0024 — Rafraîchit updated_at des 6 deals publiés dont le titre a été corrigé par 0023 (lot SEO-2b, 22/11/2026).
--
-- 0023 a décodé les entités HTML de 29 titres sans toucher updated_at
-- (aucun trigger ne l'exige). Or updated_at sert de signal de fraîcheur :
-- `lastmod` du sitemap et version de l'og:image (CONTRAT-V1 §6,
-- `[version]` = epoch de updated_at). Pour les 6 deals PUBLIÉS concernés,
-- le titre a changé sans que ces signaux le disent. Les 23 autres (expire
-- jamais publié, rejete) ne sont ni dans le sitemap ni partagés : non
-- concernés.
--
-- Transaction : assurée par le runner (packages/db/src/migrate.ts) — pas
-- de BEGIN/COMMIT ici.

update deals
   set updated_at = now()
 where public_id in ('zne8b89gwf', 'iysk2juwcp', 'y69s2muf4m', 'e6mz35uffr', 'x422kbu6c9', 'pekn9tjzf9');

-- Contrôle : en production, les 6 lignes doivent exister et porter le
-- updated_at de cette transaction (now() est figé pour toute la
-- transaction). Sinon, exception → la transaction du runner est annulée,
-- 0024 non enregistrée.
--
-- Seul cas toléré : AUCUN des 6 public_id n'existe — base vierge du job CI
-- `integration`, qui rejoue toutes les migrations sans données de prod.
-- Signalé par un NOTICE, jamais confondu avec la prod : une base où 1 à 5
-- de ces deals existent lève l'exception comme une base où ils n'ont pas
-- tous été mis à jour.
do $$
declare
  existants integer;
  touches integer;
begin
  select count(*),
         count(*) filter (where updated_at = now())
    into existants, touches
    from deals
   where public_id in ('zne8b89gwf', 'iysk2juwcp', 'y69s2muf4m', 'e6mz35uffr', 'x422kbu6c9', 'pekn9tjzf9');
  if existants = 0 then
    raise notice '0024 : aucun des 6 deals présent (base sans données de production) — rien à mettre à jour';
  elsif touches <> 6 then
    raise exception '0024 : % ligne(s) mises à jour sur % présentes, 6 attendues — migration annulée', touches, existants;
  end if;
end
$$;
