-- Audit log des actions admin (plan v2, Phase 3). Pas dans CONTRAT-V1 — table
-- interne nouvelle, nommée en français par cohérence (CONTRAT-V1 §7).

create table journal_audit (
  id bigserial primary key,
  admin_id uuid not null references users(id),
  action text not null,
  cible_type text not null,
  cible_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index journal_audit_admin_idx on journal_audit (admin_id, created_at desc);
