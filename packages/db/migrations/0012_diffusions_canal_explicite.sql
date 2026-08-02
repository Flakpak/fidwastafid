-- 0012 — `diffusions.telegram_message_id` devient `external_message_id` (text).
--
-- POURQUOI CE RENOMMAGE : la table était déjà multi-canal (colonne `canal`,
-- contrainte `unique (deal_id, canal)`), mais sa colonne d'identifiant ne
-- l'était pas. 0011 assumait ce nom spécifique — « une colonne qui ne veut
-- pas dire la même chose selon la ligne est un piège » — au motif que Discord
-- (webhook) n'en produirait pas. C'était faux : un webhook Discord appelé
-- avec `?wait=true` RENVOIE l'identifiant du message créé, et c'est
-- précisément ce qui rend l'annulation possible. Sans lui, une diffusion
-- Discord serait définitive — le défaut corrigé côté Telegram le 02/08.
--
-- POURQUOI `text` ET PAS `bigint` : les identifiants Discord sont des
-- snowflakes 64 bits transportés en CHAÎNE dans l'API JSON, précisément
-- parce qu'ils dépassent la précision entière de JavaScript
-- (Number.MAX_SAFE_INTEGER = 2^53-1). Les stocker en `bigint` obligerait à
-- les faire transiter par un `Number` côté Node, où les derniers chiffres
-- seraient silencieusement arrondis — et un identifiant arrondi ne supprime
-- rien, il désigne un autre message ou aucun. `text` conserve la valeur telle
-- que la plateforme l'a émise, pour tous les canaux.
--
-- Les identifiants Telegram, eux, sont de petits entiers : les convertir en
-- texte ne perd rien. La conversion ci-dessous est donc sûre dans les deux
-- sens de lecture.

alter table diffusions rename column telegram_message_id to external_message_id;

alter table diffusions
  alter column external_message_id type text
  using external_message_id::text;

comment on column diffusions.external_message_id is
  'Identifiant du message tel que renvoyé par la plateforme du canal (message_id Telegram, id Discord). Stocké en text : les snowflakes Discord dépassent la précision entière de JavaScript, un arrondi désignerait un autre message.';
