-- Purge d'images (lot 4, plan « suppression administrative des deals »).
-- Le seul geste irréversible de tout le dispositif : contrairement à
-- deals.supprime_le (lot 1) et memoire_curation.levee_le (lot 2), une image
-- réellement effacée du Storage ne revient pas. D'où le double garde-fou
-- porté par apps/pipeline/purger-images.mjs, pas par cette migration : délai
-- de 90 jours (largement au-delà de l'horizon de sauvegarde — l'artefact de
-- backup ne vit que 30 jours, cf. db-backup.yml — purger avant créerait une
-- fenêtre où une restauration serait incomplète et silencieuse : le deal
-- revient, son image non) et double condition (supprime_le renseigné ET
-- deals_protection.protege = false, lot 3).
--
-- image_key N'EST PAS effacé par la purge : il reste la trace historique de
-- ce qui existait (quel fichier, quelle clé) — seul image_purgee_le fait foi
-- de ce qui est réellement récupérable. toDeal()/resolveDealImageKey()
-- masquent l'image dès que image_purgee_le est renseigné, quel que soit
-- l'état de supprime_le : une ligne purgée puis restaurée revient donc SANS
-- image, jamais avec un lien mort servi comme si le fichier existait encore.
alter table deals add column image_purgee_le timestamptz;

-- Compte « système » pour l'attribution au journal d'audit des actions
-- automatisées non déclenchées par un admin humain (jusqu'ici journal_audit
-- n'avait toujours que des admin_id réels — admin_id uuid not null
-- references users(id), migration 0001). users.id n'a pas de FK vers l'auth
-- Supabase (juste un uuid) : ce compte n'a donc jamais besoin d'exister côté
-- Auth, et il n'est PAS inséré dans `admins` — aucun accès, seulement une
-- identité de traçabilité pour un job qui tourne sans utilisateur derrière
-- lui.
insert into users (id, public_id, pseudo)
values ('00000000-0000-0000-0000-000000000001', 'systemepq2', 'Pipeline')
on conflict (id) do nothing;
