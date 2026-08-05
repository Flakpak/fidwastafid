// Utilisateur système « Pipeline » (migration 0016) — attribution
// journal_audit des actions automatisées, jamais un admin humain. Partagé
// entre purger-images.mjs et purger-lignes.mjs pour ne jamais dupliquer cet
// UUID (même raison que empreinte_curation() : une seule vérité, partagée).
export const UTILISATEUR_SYSTEME_ID = "00000000-0000-0000-0000-000000000001";
