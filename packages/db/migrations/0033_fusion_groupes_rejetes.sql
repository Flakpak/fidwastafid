-- 0033 — Fusion des 7 groupes écartés de 0032 (lot SEO-2k, CONTRAT-V1 §3,
-- vingt-cinquième et vingt-sixième amendements, 23/11/2026).
--
-- Ces produits ont une empreinte rejetée par l'admin mais une fiche publiée :
-- le rejet y est celui d'un doublon. Même règle que 0032 : fiche conservée =
-- publiée active au vu_le le plus récent ; à égalité, la plus anciennement
-- publiée. Liste figée par public_id, relevée en production le 23/11/2026 :
-- 7 fiches fusionnées (1 publiée, 6 expirées). Les lignes rejetées ne bougent pas.
--
-- Transaction : assurée par le runner (packages/db/src/migrate.ts).

create temporary table fusion_0033 (
  perdant text primary key,
  gagnant text not null,
  statut_attendu text not null
) on commit drop;

insert into fusion_0033 (perdant, gagnant, statut_attendu) values
  ('24q2ju939e', 'fwum8r9yjb', 'publie'),
  ('9g2jv3h29j', 'ay5jf3hrnw', 'expire'),
  ('ht698divqn', 'mxeac6j6rz', 'expire'),
  ('7vu8rcppri', 'g3ue5pj2nc', 'expire'),
  ('ey7v82gabi', 'pxb9zdkwxv', 'expire'),
  ('dvjg5wrjdf', 'wefgy6zwzz', 'expire'),
  ('4ye2fiu9v6', 'nr8iqkesfe', 'expire');

update deals d
   set statut = 'expire', fusionne_dans = f.gagnant, updated_at = now()
  from fusion_0033 f
 where d.public_id = f.perdant
   and d.statut = f.statut_attendu
   and d.supprime_le is null
   and d.fusionne_dans is null;

-- Contrôle : 7 fiches fusionnées vers une fiche publiée non fusionnée, et plus
-- aucun produit avec plus d'une fiche publiée active. Sinon exception et
-- annulation. Seul cas toléré, comme 0024 : aucune de ces fiches n'existe (base
-- vierge du job CI integration).
do $$
declare
  existants integer;
  fusionnees integer;
  cibles_valides integer;
  doublons integer;
begin
  select count(*),
         count(*) filter (where d.fusionne_dans = f.gagnant and d.statut = 'expire' and d.updated_at = now()),
         count(*) filter (where c.statut = 'publie' and c.fusionne_dans is null and c.supprime_le is null)
    into existants, fusionnees, cibles_valides
    from fusion_0033 f
    join deals d on d.public_id = f.perdant
    left join deals c on c.public_id = f.gagnant;

  if existants = 0 then
    raise notice '0033 : aucune fiche présente (base sans données de production) — rien à fusionner';
    return;
  end if;

  if fusionnees <> 7 or cibles_valides <> 7 then
    raise exception '0033 : % fusionnées, % cibles valides, 7 attendues — migration annulée', fusionnees, cibles_valides;
  end if;

  select count(*) into doublons from (
    select 1
      from deals d
     where d.statut = 'publie' and d.supprime_le is null
       and (d.date_fin is null or d.date_fin >= (now() at time zone 'Africa/Casablanca')::date)
     group by empreinte_curation(d.lien, d.titre, d.enseigne_id)
    having count(*) > 1
  ) g;
  if doublons <> 0 then
    raise exception '0033 : % produit(s) ont encore plusieurs fiches publiées actives — migration annulée', doublons;
  end if;
end
$$;
