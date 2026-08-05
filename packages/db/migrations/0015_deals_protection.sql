-- Critère de protection contre la purge (lot 3, plan « suppression
-- administrative des deals »). Lecture seule : cette migration ne modifie
-- AUCUNE ligne de `deals` ni d'aucune autre table de données — elle crée
-- une vue, une projection calculée à la lecture, jamais un état stocké.
--
-- Le critère n'est PAS le statut courant (414 `expire` de l'historique
-- n'ont jamais été publiées — diagnostic du 04/08/2026 : le pipeline
-- expire directement un auto_draft trop ancien, sans jamais passer par
-- publie). Le critère est l'EXISTENCE d'une trace de publication dans
-- journal_audit, qui survit à tout changement de statut ultérieur — y
-- compris un retour à auto_draft, volontaire ou non.
create or replace view deals_protection as
select
  d.public_id,
  d.statut,
  d.supprime_le,
  (
    -- Transition explicite vers `publie`, dans les DEUX formes de JSON
    -- réellement rencontrées en base : `update_deal` imbrique sous
    -- `statut.apres`, `update_statut` (action historique, plus émise par
    -- le code actuel mais présente dans l'historique réel) et
    -- `bulk_update_statut` sont plates (`apres` à la racine). `coalesce`
    -- essaie la forme imbriquée puis la forme plate — jamais les deux à
    -- la fois pour une même ligne, l'une des deux vaut toujours NULL.
    exists (
      select 1 from journal_audit ja
      where ja.cible_type = 'deal' and ja.cible_id = d.public_id
        and coalesce(ja.details -> 'statut' ->> 'apres', ja.details ->> 'apres') = 'publie'
    )
    -- Preuve INDÉPENDANTE : une diffusion communautaire ne peut arriver
    -- que sur un deal `publie` (garde côté API, _lib/diffusion.ts) —
    -- vaut comme preuve de publication même si la détection de
    -- transition de statut ci-dessus la manquait pour une raison qui
    -- n'a pas été anticipée ici.
    or exists (
      select 1 from journal_audit ja
      where ja.cible_type = 'deal' and ja.cible_id = d.public_id
        and ja.action in ('diffuser_telegram', 'diffuser_discord')
    )
    -- REPLI PROTECTEUR (CONTRAT-V1 §3, règle gravée le 05/08/2026) : toute
    -- action journal_audit d'un type NON couvert par les deux blocs
    -- ci-dessus est un DOUTE, pas une absence de preuve — protégé,
    -- jamais l'inverse. La liste ci-dessous énumère tout ce qui existe
    -- réellement en base au 05/08/2026 (relevé par le connecteur en
    -- lecture seule) et qui ne prouve PAS une publication : édition
    -- hors statut, annulation de diffusion, upload d'image, suppression
    -- douce, restauration. Une action future non listée ici bascule
    -- automatiquement en doute -> protégé, sans modification de cette
    -- vue.
    or exists (
      select 1 from journal_audit ja
      where ja.cible_type = 'deal' and ja.cible_id = d.public_id
        and ja.action not in (
          'update_deal', 'update_statut', 'bulk_update_statut',
          'diffuser_telegram', 'annuler_diffusion_telegram',
          'diffuser_discord', 'annuler_diffusion_discord',
          'update_image_depuis_lien', 'supprimer_deal', 'restaurer_deal'
        )
    )
  ) as protege
from deals d;
