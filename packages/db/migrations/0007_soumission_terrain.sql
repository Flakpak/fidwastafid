-- Soumission terrain (CONTRAT-V1 §3, amendement du 18/07/2026) : commerces
-- informels marocains (hanout, marché, boutique sans enseigne curée).
-- nom_vendeur/adresse/lien_maps sont du texte libre saisi par le
-- soumetteur — jamais une enseigne curée, jamais de page /enseigne générée.
-- motif_rejet : retour du curateur, visible par le soumetteur (GET /api/v1/me).
alter table deals add column nom_vendeur text;
alter table deals add column adresse text;
alter table deals add column lien_maps text;
alter table deals add column motif_rejet text;

-- Consentement WhatsApp public (CONTRAT-V1 §4, amendement du 18/07/2026,
-- deuxième amendement conscient de la liste fermée) : whatsapp_contact
-- n'est exposé publiquement que si whatsapp_public = true. Défaut false —
-- tout deal existant reste admin-only tant que le soumetteur n'a pas
-- explicitement consenti.
alter table deals add column whatsapp_public boolean not null default false;
