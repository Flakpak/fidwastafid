-- Rate limiting Postgres-backé (plan v2, Phase 3) — pas de mémoire process,
-- pas de Redis : la cible de transition est Vercel serverless (pas d'état
-- partagé entre invocations), et Postgres suffit à l'échelle visée.
-- CONTRAT-V1 §4 : ciblé sur les écritures non-admin (POST votes/commentaires/deals).

create table rate_limits (
  cle text primary key,
  compte integer not null default 1,
  fenetre_debut timestamptz not null default now()
);
