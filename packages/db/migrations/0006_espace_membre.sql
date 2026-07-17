-- Espace membre (CONTRAT-V1 §4, amendement du 16/07/2026) : exercice des
-- droits d'accès/rectification/effacement (loi 09-08) + personnalisation
-- légère (couleur d'avatar).

alter table users add column couleur_avatar text not null default 'rouge'
  check (couleur_avatar in ('rouge', 'terracotta', 'or', 'olive', 'bleu', 'indigo', 'prune', 'ardoise'));

-- Unicité du pseudo — jamais imposée jusqu'ici (aucun doublon constaté en
-- local ni en prod au moment de cette migration). Nécessaire pour que
-- PATCH /api/v1/me puisse rejeter un changement vers un pseudo déjà pris.
alter table users add constraint users_pseudo_unique unique (pseudo);

-- Nécessaire pour l'anonymisation des commentaires à la suppression de
-- compte (DELETE /api/v1/me) : l'auteur doit pouvoir devenir null sans
-- perdre le commentaire lui-même (deals.submitter_id l'était déjà nullable).
alter table commentaires alter column auteur_id drop not null;
