-- 0034 — Fiches Carrefour réactivées à tort (lot SEO-2l, 23/11/2026).
--
-- Le run 45265729769 a réactivé 13 fiches dont la promotion était déjà
-- terminée : l'API carrefour.ma les liste encore, avec une date de fin passée.
-- Elles restaient en brouillon (`date_fin_passee`) et repassent en `expire`.
-- Liste figée par public_id, relevée en production le 23/11/2026.
--
-- La fiche publiée qui a reçu une date passée (`qmsayqve6t`) n'est pas
-- concernée : expirer-publies la traite au prochain run.
--
-- Transaction : assurée par le runner (packages/db/src/migrate.ts).

create temporary table expiration_0034 (public_id text primary key) on commit drop;

insert into expiration_0034 (public_id) values
  ('2dg34a6z6i'), ('7d6zd5xcs4'), ('7td6frdw6q'), ('bpajcsqcjz'), ('cfckgkeec3'),
  ('gdskrvxbjk'), ('mjkdqacbmb'), ('q8bpnn6e2d'), ('rxfi897ndu'), ('tz9yb87687'),
  ('xuyu4ntpap'), ('yemz3ameik'), ('yes98ppnf2');

update deals d
   set statut = 'expire', updated_at = now()
  from expiration_0034 x
 where d.public_id = x.public_id
   and d.statut = 'auto_draft'
   and d.supprime_le is null;

-- Contrôle : 13 lignes passées en expire par CETTE transaction, sinon exception
-- et annulation. Seul cas toléré, comme 0024 : aucune de ces fiches n'existe
-- (base vierge du job CI integration).
do $$
declare
  existants integer;
  expirees integer;
begin
  select count(*),
         count(*) filter (where d.statut = 'expire' and d.updated_at = now())
    into existants, expirees
    from expiration_0034 x
    join deals d on d.public_id = x.public_id;

  if existants = 0 then
    raise notice '0034 : aucune fiche présente (base sans données de production) — rien à expirer';
    return;
  end if;

  if expirees <> 13 then
    raise exception '0034 : % ligne(s) expirée(s) sur % présentes, 13 attendues — migration annulée', expirees, existants;
  end if;
end
$$;
