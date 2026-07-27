-- 0010 — traçabilité de la vérification anti-robot sur les soumissions.
--
-- Fait générateur : `verifyTurnstile` repliait toute réponse non-2xx sur
-- `false` (_lib/turnstile.ts). Une panne Cloudflare devenait donc
-- indistinguable d'un « utilisateur = robot » : toutes les soumissions
-- rejetées, sans trace, sans alerte. Troisième occurrence du motif consigné
-- dans docs/INCIDENTS.md (19/07 clé révoquée, 24/07 API admin Supabase).
--
-- Décision : sur panne d'infrastructure (429/5xx/réseau, après retries
-- bornés), la soumission est ACCEPTÉE mais marquée non vérifiée, plutôt que
-- rejetée en silence. C'est tenable ici, et seulement ici, parce que toute
-- soumission passe déjà par la file de validation humaine (statut
-- `en_attente`) : rien n'atteint le feed public sans modérateur. Le badge de
-- la file (back-office) signale ces lignes pour que le curateur redouble
-- d'attention.
--
-- Défaut `true` : les lignes existantes ont toutes franchi une vérification
-- réellement passante — les marquer `false` rétroactivement affirmerait un
-- fait qu'on ne sait pas. `not null` : l'inconnue n'existe pas ici, une
-- soumission est vérifiée ou elle ne l'est pas.

alter table deals add column turnstile_verifie boolean not null default true;

comment on column deals.turnstile_verifie is
  'false = soumission acceptée alors que Cloudflare Turnstile était injoignable (panne 429/5xx/réseau). À examiner de plus près en validation. Voir _lib/turnstile.ts.';
