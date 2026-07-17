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

## Images (15/07/2026)

- Images des deals catalogue : `extract-catalogue.mjs` (pipeline, hors
  monorepo) n'extrait que l'image de la page entière du catalogue envoyée à
  Claude — aucune coordonnée par produit n'est disponible, donc aucune
  image individuelle associable à un deal catalogue (cf. audit du
  15/07/2026). Pour y remédier : demander une bounding box par produit dans
  le prompt d'extraction + recadrage `sharp` côté pipeline — chantier réel,
  coût/fiabilité à évaluer (fiabilité des bounding box retournées par
  l'API, temps de traitement). En attendant, les deals catalogue partent
  sans image ; seuls les deals Bringo (scraper) en ont une (module image,
  `images.mjs`).
- Qualité de `mapCategorie()` (scraper Bringo) : sur les 569 deals réels
  archivés, 375 (66 %) tombent dans "Autre" — le mapping par mots-clés sur
  `item_list_name` est trop pauvre pour catégoriser correctement le
  catalogue Carrefour/Bringo. Pistes : enrichir la liste de mots-clés, ou
  déléguer la catégorisation à l'API Claude à l'ingestion (comme
  `extract-catalogue.mjs` le fait déjà pour les catalogues).

## Favoris (2026-07-17)

Favoris/bookmark sur les cartes (type Dealabs) — nécessite table + endpoints
+ page mes-favoris, feature complète post-lancement.

## Monétisation

Deals sponsorisés = colonne `sponsorise` boolean + badge sur la carte + critère de tri, post-Phase 6, quand il y aura un premier annonceur réel. Affiliation = paramètre de tracking sur le champ `lien` existant. Display ads (AdSense & co) : ÉCARTÉ — incompatible CSP par nonce, contraire au positionnement premium, rentable uniquement à fort volume.
