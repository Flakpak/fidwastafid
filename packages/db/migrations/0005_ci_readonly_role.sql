-- Role CI dedie a la verification de coherence en lecture seule entre
-- packages/db/migrations/ et schema_migrations (CONTRAT-V1 §7). Cree SANS
-- mot de passe ici : login impossible tant qu'un humain n'a pas execute
-- `alter role ci_migrations_check with password '...'` directement contre
-- la base, hors du runner et hors de toute conversation/commit.
--
-- Peu de privileges a dessein : connexion + lecture de schema_migrations
-- uniquement, aucun SELECT global sur public.

create role ci_migrations_check login;

do $$
begin
  execute format('grant connect on database %I to ci_migrations_check', current_database());
end
$$;

grant usage on schema public to ci_migrations_check;
grant select on schema_migrations to ci_migrations_check;
