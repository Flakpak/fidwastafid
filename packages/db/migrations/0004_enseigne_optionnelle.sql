-- Enseigne optionnelle sur un deal (CONTRAT-V1 §3, amendement) — commerces
-- indépendants/hanouts sans enseigne référencée. Additive uniquement :
-- retire une contrainte, ne touche à rien d'autre (pas de DROP, pas de
-- renommage). deals.enseigne_id reste une FK vers enseignes(id) quand
-- elle est renseignée.

alter table deals alter column enseigne_id drop not null;
