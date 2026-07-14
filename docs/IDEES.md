# IDÉES — à trier après la mise en prod de la v2

*(CONTRAT-V1.md / PRINCIPES NON NÉGOCIABLES §6 : aucune feature ajoutée en cours de phase — les idées atterrissent ici, triées après la Phase 6.)*

## Dette technique temporaire

- `apps/web/src/app/api/v1/_lib/turnstile.ts` : log temporaire
  (`[turnstile-diag]`) des `error-codes`/`hostname` retournés par
  `siteverify` en cas d'échec — ajouté pour diagnostiquer le rejet
  Turnstile en préversion (post-Bloc 5). À retirer une fois la cause
  confirmée via les logs Vercel.

## UX auth

- Inscription avec un email déjà utilisé (non confirmé) : Supabase
  n'envoie rien (anti-énumération), silence côté utilisateur — proposer
  de renvoyer l'email de confirmation plutôt que de laisser l'utilisateur
  sans retour. Comportement standard Supabase, pas un bug — juste une UX
  à améliorer.

## Profil / Mes deals

Page profil v1 (post-patch CNDP) réduite à une carte lecture seule dont
les stats (`score_reputation`, `deals_soumis`, ...) n'existent pas dans
le modèle v2. Absente en v2 — exception de parité consciente, cf.
CONTRAT-V1 §2/§4 (aucune de ces routes n'y figure), amendement Phase 4
ci-dessus. Post-Phase 6 : page profil minimale (pseudo, email) + "Mes
deals" avec édition — nécessite un amendement du contrat API (`PATCH`
deal par son auteur → repasse `en_attente`, hors de la liste fermée
actuelle §4).

## Monétisation

Deals sponsorisés = colonne `sponsorise` boolean + badge sur la carte + critère de tri, post-Phase 6, quand il y aura un premier annonceur réel. Affiliation = paramètre de tracking sur le champ `lien` existant. Display ads (AdSense & co) : ÉCARTÉ — incompatible CSP par nonce, contraire au positionnement premium, rentable uniquement à fort volume.
