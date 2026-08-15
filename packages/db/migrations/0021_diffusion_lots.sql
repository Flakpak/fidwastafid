-- 0021 — diffusion en masse (CONTRAT-V1 §4, dix-neuvième amendement
-- conscient). Deux tables, PAS une extension de `diffusions` : un lot est un
-- ÉVÉNEMENT d'intention (« diffuser ces N deals, sur ce canal, dans ce
-- mode »), distinct de l'événement de diffusion individuelle lui-même
-- (`diffusions`, qui ne bouge pas — la diffusion en masse RÉUTILISE
-- diffuser()/annuler() de _lib/diffusion.ts, elle n'écrit jamais dans
-- `diffusions` par un autre chemin).
--
-- POURQUOI UNE TABLE DE PROGRESSION, ET PAS journal_audit COMME LE REJET EN
-- MASSE (adminDealsLots.ts) : le rejet en masse est SYNCHRONE (borné à 100
-- lignes, une seule transaction, terminé avant la réponse HTTP). Une
-- diffusion en masse ne peut PAS l'être : l'étalement demandé entre deux
-- envois consécutifs (throttle, cf. code applicatif) dépasserait le délai
-- d'exécution d'une fonction serverless pour un lot de taille réaliste.
-- `diffusion_lot_deals` est donc l'état PERSISTANT et interrogeable d'un lot
-- en cours — nécessaire pour la reprise sans renvoi après un rechargement de
-- page, pas seulement pour l'affichage de progression.
create table diffusion_lots (
  id uuid primary key,
  canal text not null,
  mode text not null,
  admin_id uuid not null references users(id),
  cree_le timestamptz not null default now(),
  constraint diffusion_lots_mode_check check (mode in ('production', 'test'))
);

-- Statuts, PAS un booléen : 'deja_diffuse' distingue explicitement « déjà
-- diffusé avant même le début de ce lot » (jamais renvoyé, jamais un appel
-- réseau) de 'envoye' (diffusé PAR ce lot) — la reprise sans renvoi lit ces
-- deux valeurs différemment (aucune n'est retraitée, mais un rapport de lot
-- doit pouvoir dire lequel des deux).
create table diffusion_lot_deals (
  lot uuid not null references diffusion_lots(id) on delete cascade,
  deal_id bigint not null references deals(id) on delete cascade,
  public_id text not null,
  statut text not null default 'en_attente',
  message_id text,
  erreur text,
  statut_http int,
  traite_le timestamptz,
  primary key (lot, deal_id),
  constraint diffusion_lot_deals_statut_check
    check (statut in ('en_attente', 'deja_diffuse', 'envoye', 'echoue'))
);

-- La progression se lit toujours PAR lot (POST .../suivant choisit le
-- prochain 'en_attente', GET .../lot/:lot affiche l'état complet) — jamais
-- un scan de toute la table.
create index diffusion_lot_deals_lot_idx on diffusion_lot_deals (lot);

comment on table diffusion_lots is
  'Une ligne = une diffusion en masse demandée (canal, mode, qui). N''écrit jamais dans diffusions : la brique diffuser() par-deal reste l''unique chemin d''écriture réelle.';
comment on table diffusion_lot_deals is
  'État persistant, par deal, d''un lot de diffusion — nécessaire à la reprise sans renvoi et à la progression visible après rechargement de page (pas seulement en mémoire côté client).';

-- RLS, même convention que 0011/0008 : schéma public retiré de l'API Data,
-- mais deny-all explicite pour ne jamais dépendre de ce réglage plateforme.
-- Aucune policy = deny-all pour anon/authenticated ; le rôle applicatif
-- (app) n'est jamais soumis à RLS. SURTOUT PAS de FORCE ROW LEVEL SECURITY.
alter table public.diffusion_lots enable row level security;
alter table public.diffusion_lot_deals enable row level security;
