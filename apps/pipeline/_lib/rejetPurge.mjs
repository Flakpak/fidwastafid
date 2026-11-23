// ============================================================
// FIDWASTAFID — Une purge ne bloque pas (lot SEO-2m)
//
// « Purge » est un motif saisi à la main lors des rejets en masse de l'admin
// (écrit « Purge » ou « purge » en production). C'est un nettoyage, pas un
// jugement sur le produit : il ne bloque jamais son retour. Un rejet sans
// motif n'est pas une purge et continue de bloquer.
// ============================================================

/** Condition SQL : le motif de cette colonne est une purge. */
export const estPurgeSql = (colonne) => `lower(trim(coalesce(${colonne}, ''))) = 'purge'`;
