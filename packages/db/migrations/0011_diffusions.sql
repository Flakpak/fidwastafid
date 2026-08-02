-- 0011 — table `diffusions` : trace des publications d'un deal vers les
-- canaux communautaires (Telegram en v1, cf. docs/IDEES.md « Diffusion
-- communautaire »).
--
-- POURQUOI UNE TABLE, ET PAS UN BOOLÉEN SUR `deals` : la diffusion est un
-- ÉVÉNEMENT (quand, par quel canal, quel message côté plateforme), pas un
-- état du deal. Un `deals.diffuse boolean` ne saurait pas répondre à
-- « diffusé sur Telegram mais pas sur Discord », qui est exactement la suite
-- prévue. La table porte l'historique ; le deal reste le deal.
--
-- LA CONTRAINTE UNIQUE EST LE GARDE-FOU RÉEL. L'endpoint vérifie déjà
-- l'absence de ligne avant d'appeler Telegram, mais deux clics simultanés
-- passeraient tous les deux cette lecture. `unique (deal_id, canal)` fait
-- échouer le second INSERT en base — c'est la seule garantie qui ne dépende
-- pas du timing. Un double envoi dans un canal public ne se rattrape pas.
--
-- `telegram_message_id` NULLABLE : la colonne n'a de sens que pour le canal
-- telegram. Discord (webhook) et WhatsApp (semi-manuel, cf. IDEES) n'en
-- produiront pas. Nommée explicitement plutôt qu'un `message_id` générique —
-- une colonne qui ne veut pas dire la même chose selon la ligne est un piège
-- qu'on se tend à soi-même.
--
-- Pas de valeur `canal` contrainte en base (CHECK ou enum) : même convention
-- que `categorie` (CONTRAT-V1 §3), la liste fermée vit côté applicatif. La
-- valeur par défaut 'telegram' reflète le seul canal automatisé de la v1.

create table diffusions (
  id bigserial primary key,
  deal_id bigint not null references deals(id) on delete cascade,
  canal text not null default 'telegram',
  diffused_at timestamptz not null default now(),
  telegram_message_id bigint,
  constraint diffusions_deal_canal_unique unique (deal_id, canal)
);

comment on table diffusions is
  'Une ligne = un deal publié sur un canal communautaire. La contrainte unique (deal_id, canal) est l''anti-double-publication ; elle prime sur la vérification applicative, qui ne résiste pas à deux clics simultanés.';

comment on column diffusions.telegram_message_id is
  'message_id renvoyé par l''API Bot Telegram (sendPhoto). NULL pour tout autre canal — colonne volontairement spécifique plutôt que générique.';

-- RLS, comme les 9 tables de 0008 : le schéma public est retiré de l'API
-- Data, mais une table sans RLS redeviendrait exposée si ce réglage
-- plateforme changeait — et surtout, elle apparaîtrait comme une NOUVELLE
-- entrée `rls_disabled_in_public` dans l'advisor Supabase, dont l'état
-- nominal est gravé au CONTRAT-V1 §9. Sans policy = deny-all pour
-- anon/authenticated ; le rôle propriétaire (app, pipeline) n'est jamais
-- soumis à RLS. SURTOUT PAS de FORCE ROW LEVEL SECURITY, même raison qu'en
-- 0008.
alter table public.diffusions enable row level security;

-- Lecture par deal : l'admin affiche l'état « déjà diffusé » sur chaque deal
-- de la file. L'index unique de la contrainte couvre déjà (deal_id, canal),
-- donc aucun index supplémentaire n'est nécessaire ici — noté pour que
-- personne n'en rajoute un par réflexe.
