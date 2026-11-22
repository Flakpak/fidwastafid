-- 0026 — Reclassement manuel des 49 deals publiés rangés sous « Autre » (lot SEO-2c, 22/11/2026).
--
-- Mapping décidé par Kamel sur la liste relevée à l'audit SEO-2 (annexe 1.5).
-- Il vise les nouvelles catégories du vingt-deuxième amendement
-- (CONTRAT-V1 §3) : le code qui les connaît est en production depuis la PR #191
-- (435e996), condition préalable posée par l'amendement (toDeal valide
-- categorie par dealSchema.parse).
--
-- 49 lignes ciblées par public_id : 37 publie et 12 expire au moment de la
-- rédaction (douze sont passées en expire au lot SEO-2b, après l'audit).
-- Seules categorie et updated_at changent ; updated_at = now() rafraîchit
-- le lastmod du sitemap et la version de l'og:image.
--
-- Transaction : assurée par le runner (packages/db/src/migrate.ts) — pas
-- de BEGIN/COMMIT ici.

create temporary table reclassement_0026 (public_id text primary key, categorie text not null) on commit drop;

insert into reclassement_0026 (public_id, categorie) values
  ('qwakpcxquf', 'Fournitures scolaires'),
  ('5v4wbtvqv3', 'Fournitures scolaires'),
  ('zemcte65jr', 'Fournitures scolaires'),
  ('jbvmqjj6hh', 'Fournitures scolaires'),
  ('8kexqueba5', 'Fournitures scolaires'),
  ('vdiezn877t', 'Fournitures scolaires'),
  ('e4h8mfz4vs', 'Fournitures scolaires'),
  ('iysk2juwcp', 'Fournitures scolaires'),
  ('htcr6ckf3z', 'Fournitures scolaires'),
  ('ywbn6b8k4r', 'Fournitures scolaires'),
  ('s3xyicduws', 'Fournitures scolaires'),
  ('dcyzvntg8s', 'Fournitures scolaires'),
  ('a5utevz7nm', 'Fournitures scolaires'),
  ('nrrrbmvnps', 'Fournitures scolaires'),
  ('6ef5cmv5vq', 'Fournitures scolaires'),
  ('pdc4f6q85j', 'Fournitures scolaires'),
  ('9u852cc7gt', 'Fournitures scolaires'),
  ('t7d8p6ej4y', 'Enfants & Jouets'),
  ('de9gkfsha4', 'Enfants & Jouets'),
  ('xwdnnz4r7x', 'Enfants & Jouets'),
  ('mxxrjiv7vw', 'Enfants & Jouets'),
  ('ibek8stmh9', 'Enfants & Jouets'),
  ('jpz6e3n2sh', 'Enfants & Jouets'),
  ('5gtci5xutr', 'Maison'),
  ('jh3mx94qwd', 'Maison'),
  ('z93t54fung', 'Maison'),
  ('zv5mzgfpdz', 'Maison'),
  ('t9dhbf8r2s', 'Maison'),
  ('cfckgkeec3', 'Maison'),
  ('qmsayqve6t', 'Maison'),
  ('gdskrvxbjk', 'Maison'),
  ('sqxnwrqd5w', 'Sport'),
  ('sbt7qrvthb', 'Sport'),
  ('ufws4jy32c', 'Sport'),
  ('udx495jdv5', 'Sport'),
  ('7d6zd5xcs4', 'Sport'),
  ('a839viinsk', 'Électroménager'),
  ('3nih2i8i8i', 'Électroménager'),
  ('sgmeibtc67', 'Électroménager'),
  ('wsgp8b8zh8', 'Électroménager'),
  ('q8bpnn6e2d', 'Alimentaire'),
  ('mjkdqacbmb', 'Alimentaire'),
  ('ms7u3du26r', 'Alimentaire'),
  ('rxfi897ndu', 'Alimentaire'),
  ('7td6frdw6q', 'High-Tech'),
  ('xuyu4ntpap', 'High-Tech'),
  ('yemz3ameik', 'High-Tech'),
  ('raybhgvtdb', 'Bricolage & Jardin'),
  ('bpajcsqcjz', 'Beauté');

update deals d
   set categorie = r.categorie, updated_at = now()
  from reclassement_0026 r
 where d.public_id = r.public_id;

-- Contrôle final. Sinon exception → la transaction du runner est annulée,
-- 0026 non enregistrée.
--   - les 49 lignes portent la catégorie cible et le updated_at de cette
--     transaction ;
--   - plus aucun deal publié (non supprimé) en « Autre ».
-- Seul cas toléré, comme 0024 : AUCUN des 49 public_id n'existe (base
-- vierge du job CI integration), signalé par un NOTICE.
do $$
declare
  existants integer;
  modifies integer;
  publie_autre integer;
begin
  select count(*),
         count(*) filter (where d.categorie = r.categorie and d.updated_at = now())
    into existants, modifies
    from reclassement_0026 r
    join deals d on d.public_id = r.public_id;

  if existants = 0 then
    raise notice '0026 : aucun des 49 deals présent (base sans données de production) — rien à reclasser';
    return;
  end if;

  if modifies <> 49 then
    raise exception '0026 : % ligne(s) reclassées sur % présentes, 49 attendues — migration annulée', modifies, existants;
  end if;

  select count(*) into publie_autre
    from deals
   where statut = 'publie' and categorie = 'Autre' and supprime_le is null;
  if publie_autre <> 0 then
    raise exception '0026 : % deal(s) publié(s) encore en « Autre » — migration annulée', publie_autre;
  end if;
end
$$;
