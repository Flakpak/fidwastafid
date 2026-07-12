-- Schéma v2 initial (CONTRAT-V1 §3).
-- Cible : Postgres local (docker-compose) pendant la Phase 3 uniquement.
-- La prod v1 (Supabase) n'est PAS touchée par cette migration — le v1 dépend
-- encore de colonnes renommées ici (magasin, photo_url, votes.type).

create table enseignes (
  id bigserial primary key,
  slug text not null unique,
  nom text not null,
  created_at timestamptz not null default now()
);

-- id = uuid Supabase Auth (auth.users.id en prod). Pas de FK vers auth.users :
-- ce schéma n'existe pas sur un Postgres nu / local hors Supabase.
create table users (
  id uuid primary key,
  public_id text not null unique check (public_id ~ '^[23456789abcdefghijkmnpqrstuvwxyz]{10}$'),
  pseudo text not null,
  created_at timestamptz not null default now()
);

-- Table marqueur : admins.id = users.id directement, aucune colonne user_id.
create table admins (
  id uuid primary key references users(id),
  created_at timestamptz not null default now()
);

create table deals (
  id bigserial primary key,
  public_id text not null unique check (public_id ~ '^[23456789abcdefghijkmnpqrstuvwxyz]{10}$'),
  titre text not null,
  enseigne_id bigint not null references enseignes(id),
  ville text,
  categorie text not null,
  type text not null check (type in ('physique', 'en_ligne', 'les_deux')),
  prix_promo numeric(10, 2) not null,
  prix_normal numeric(10, 2),
  date_fin date,
  description text,
  lien text,
  image_key text,
  statut text not null check (statut in ('auto_draft', 'en_attente', 'publie', 'rejete', 'expire')),
  whatsapp_contact text,
  submitter_id uuid references users(id),
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Feed public : filtré par statut, trié par score desc, id en tie-break stable
-- (pagination par curseur, jamais offset — CONTRAT-V1 §4).
create index deals_feed_idx on deals (statut, score desc, id);
create index deals_enseigne_idx on deals (enseigne_id);

create table votes (
  id bigserial primary key,
  deal_id bigint not null references deals(id) on delete cascade,
  user_id uuid not null references users(id),
  sens text not null check (sens in ('chaud', 'froid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, user_id)
);

create table commentaires (
  id bigserial primary key,
  deal_id bigint not null references deals(id) on delete cascade,
  auteur_id uuid not null references users(id),
  contenu text not null,
  created_at timestamptz not null default now()
);
