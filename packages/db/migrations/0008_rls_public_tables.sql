-- Advisor sécurité Supabase rls_disabled_in_public (21/07/2026) : les 9
-- tables du schéma public sont exposées sans RLS, avec les grants par
-- défaut complets pour les rôles anon/authenticated de l'API Data
-- (PostgREST) — un canal que l'application n'utilise JAMAIS (accès
-- exclusif par connexion Postgres directe via DATABASE_URL, rôle
-- propriétaire des tables, CONTRAT-V1 §7).
--
-- Décision : API Data non utilisée par l'app -> RLS sans policy = fermeture
-- du canal PostgREST. Aucune policy créée : deny-all pour anon/authenticated
-- (RLS activé sans policy refuse tout accès par défaut). Le rôle propriétaire
-- (celui de DATABASE_URL, identique en local et en prod, cf. constat du lot)
-- continue de tout voir/écrire normalement : PostgreSQL n'applique jamais
-- RLS au propriétaire d'une table, avec ou sans policy.
--
-- SURTOUT PAS de FORCE ROW LEVEL SECURITY : cette clause forcerait RLS même
-- pour le propriétaire de la table, cassant l'app et le pipeline (écriture
-- directe en base, hors /api/v1, cf. CONTRAT-V1 §4) — le but est de fermer
-- PostgREST, pas de gêner l'accès normal de l'application.

alter table public.deals enable row level security;
alter table public.users enable row level security;
alter table public.votes enable row level security;
alter table public.commentaires enable row level security;
alter table public.enseignes enable row level security;
alter table public.admins enable row level security;
alter table public.journal_audit enable row level security;
alter table public.rate_limits enable row level security;
alter table public.schema_migrations enable row level security;
