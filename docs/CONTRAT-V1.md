# CONTRAT V1 — fidwastafid

*Document de référence gravé en Phase 1. Toute décision future se vérifie contre ce contrat.
Le modifier après le début de la Phase 2 a un coût — ce n'est pas interdit, mais ça doit être
une décision consciente, pas une dérive.*

---

## 1 — Identité & slugs des deals

- **`public_id`** : nanoid **10 caractères**, alphabet `[a-z0-9]` (sans caractères ambigus type `0/O`, `1/l/I`).
  Généré à la création, **immuable à vie**. Fait partie du dump (donnée métier, pas un artefact d'infra).
  C'est l'**identité canonique** du deal — utilisée par l'API, le web, le mobile futur, le B2B.
- **URL web** : `/deal/[slug]-[public_id]`. Le serveur **résout uniquement sur `public_id`**
  (dernier segment après le dernier `-`). Le slug est cosmétique.
- **Slug** : dérivé à la volée depuis le titre courant (`slugify(titre)`, ASCII/minuscules/tirets,
  ~60 car max). **Pas stocké en base.** Si le slug de l'URL entrante diffère du slug canonique
  calculé, 301 vers l'URL canonique (même `public_id`) — gère nativement le cas d'un titre édité.
- **id séquentiel interne (`bigint`)** : jamais exposé, nulle part (URL, API, payload, deep link).
- **Deals expirés** : URL vivante à vie, HTTP 200, affichage d'un état « expiré » + deals similaires.
  Jamais de 404/410 sur un deal expiré — c'est un actif SEO, pas une suppression.
- **Prix retiré du slug** (divergence vs plan initial) : un deal est éphémère, son URL est éternelle ;
  le prix vit dans le contenu de la page et les données structurées `Offer` (Phase 5), pas dans l'URL.

## 2 — Arborescence d'URLs

```
/                              feed (français par défaut, jamais préfixé)
/deal/[slug]-[public_id]       page deal
/enseigne/[slug]               page enseigne   (slug humain stable, curé à la main)
/ville/[slug]                  page ville      (réservé, non actif en v1)
/categorie/[slug]               page catégorie  (réservé, non actif en v1)
/membre/[pseudo]-[public_id]   profil public   (réservé, PAS construit en v1)
/soumettre                     soumission communautaire (noindex)
/connexion  /inscription       auth (noindex)
/auth/confirm                  callback confirmation email Supabase (noindex) — ajouté en Phase 6
/admin/*                       back-office (noindex, protégé requireAdmin)
/api/v1/*                      API — porte d'entrée unique
/ar/...                        réservé si besoin futur — le français ne bouge jamais
```

**Règles transverses** :
- Minuscules partout (301 depuis toute variante en majuscule).
- Pas de trailing slash (301 depuis la version avec `/`).
- **Pas de facettes croisées** (`/enseigne/x/ville/y`) en v1 — activées plus tard, pilotées par les
  données réelles de Search Console, jamais spéculativement.
- Aucun mapping de redirection 301 depuis la v1 : le routing v1 est un hash routing client
  (`#deal-{id}`), jamais indexé par Google, jamais résolu côté serveur. La v2 démarre propre.

## 3 — Modèle de domaine

**Renommages / ajouts vs schéma actuel** (migrations Phase 2) :

| Table | Changement |
|---|---|
| `deals` | `+public_id` (nanoid10) · `magasin`→`enseigne_id` (FK) · `photo_url`→`image_key` (chemin interne, URL publique dérivée `/img/deals/[public_id]`) · `statut` passe en enum contraint DB · `+type` enum `physique\|en_ligne\|les_deux` · `whatsapp_contact` marqué admin-only |
| `users` | `+public_id` (nanoid10) — même principe, l'uuid auth ne sort jamais |
| `enseignes` | **nouvelle table** (`id`, `slug`, `nom`) — remplace le texte libre `magasin` |
| `votes` | `type`→`sens` (valeurs `chaud`\|`froid`) · contrainte unique `(deal_id, user_id)` · ligne mutable (un seul vote courant par utilisateur/deal) |
| `commentaires` | inchangé |
| `admins` | inchangé — table marqueur, alimente `requireAdmin()` |
| `stats_demographics` | **hors modèle de domaine** — instantané de reporting interne, pas une entité partagée. Problème noté pour `IDEES.md` : absence de dimension temporelle (chaque écriture écrase la précédente, pas d'historique pour des rapports hebdo). |

**Règles de validation zod issues de la distinction physique/en_ligne** :
- `ville` pertinente si `type ∈ {physique, les_deux}`, sans objet si `en_ligne`.
- `lien` attendu si `type ∈ {en_ligne, les_deux}`, sans objet si `physique` pur.

**Ville et catégorie** : enum zod fermé (liste fixe), pas de table dédiée en v1 — upgradable sans
casse si le SEO local le justifie plus tard.

**Convention de nommage** : toute nouvelle valeur d'enum en français (`chaud`/`froid`,
`physique`/`en_ligne`/`les_deux`). `auto_draft` (déjà en prod, câblé pipeline + admin) est conservé
tel quel comme exception historique documentée — pas un précédent pour de futures valeurs.

**Vigilance conformité (à traiter avant Phase 6)** : les champs démographiques d'`users`
(genre, tranche d'âge, situation familiale, nb enfants) alimentent le modèle de revenus B2B data.
Au Maroc, la collecte de données personnelles à fin de revente est encadrée par la CNDP (loi 09-08) —
généralement consentement explicite + déclaration requis. À vérifier avant la bascule prod.

**`enseigne_id` nullable** — un deal peut ne pas avoir d'enseigne (commerces indépendants, hanouts).
Décision produit du 2026-07-14, remplace l'obligation implicite initiale. Pas de valeur placeholder
type "Autre" (rejeté explicitement — page `/enseigne/autre` absurde, données polluées) : un deal sans
enseigne a `enseigne_id`/`enseigneSlug` réellement absents, partout (API, affichage, recherche).

**Amendement du 18/07/2026 — soumission terrain** : `deals` gagne quatre colonnes, pour les
commerces informels marocains (hanout, marché, boutique sans enseigne curée) :
- **`nom_vendeur`** (texte libre, optionnel) — nom du commerce quand ce n'est pas une enseigne curée.
  Les enseignes restent la table curée (`enseignes`, slug administré à la main) ; `nom_vendeur` est un
  texte libre saisi par le soumetteur et **ne génère jamais de page `/enseigne`** — pas de croisement
  entre les deux mécanismes, pas de pollution de la table curée par du texte non vérifié.
- **`adresse`** (texte libre, optionnel) — adresse du commerce.
- **`lien_maps`** (URL, optionnel) — lien Google Maps. Validation stricte à la soumission (liste
  blanche de host + chemin, voir `packages/schemas`) : jamais une URL arbitraire stockée comme lien
  de carte, pour éviter qu'un lien de phishing ou de redirection tierce se fasse passer pour une
  adresse Maps.
- **`motif_rejet`** (texte, optionnel, **admin uniquement en écriture**) — raison d'un rejet, saisie
  par le curateur, visible par le soumetteur dans son espace membre (`GET /api/v1/me`) : la
  communauté doit comprendre pourquoi son deal n'a pas été publié, pas juste constater le rejet.

**Amendement du 19/07/2026 — édition curateur complète + récupération d'image (troisième
amendement conscient de la liste fermée, voir §4 ci-dessous)** : `PATCH /api/v1/admin/deals/:publicId`
s'étend de la simple mise à jour de statut à l'édition complète des champs métier du deal
(titre, description, prixPromo, prixNormal, categorie, type, ville, dateFin, lien, enseigneSlug),
en plus des champs terrain déjà éditables (amendement du 18/07/2026 ci-dessus). Toujours
JAMAIS éditables via ce endpoint : `public_id`, `score`, `submitter_id`, `image_key` (celui-ci
passe exclusivement par le nouvel endpoint `image-depuis-lien` ci-dessous). Les mêmes règles de
cohérence physique/en_ligne que `POST /api/v1/deals` (`dealCoherenceIssues`, packages/schemas)
s'appliquent, vérifiées sur l'état RÉSULTANT de la fusion patch + valeurs existantes — un PATCH
partiel qui ne touche pas `type`/`lien` reste validé contre leurs valeurs actuelles en base.
`enseigneSlug` distingue explicitement omis (`undefined`, inchangé) de `null` (déliaison
volontaire, "aucune enseigne") — seul champ de cet amendement à supporter l'effacement, les
autres champs facultatifs restent sur la limite acceptée d'origine (omis = inchangé, pas de
moyen de les vider via ce endpoint).

**Amendement du 18/07/2026 — consentement WhatsApp public** : la règle "`whatsapp_contact`
n'apparaît jamais hors admin" (ci-dessous, §4) est remplacée par une règle conditionnée au
consentement du soumetteur — voir §4. `deals` gagne **`whatsapp_public`** (booléen, `not null default
false`) : `true` uniquement si le soumetteur a explicitement consenti à la publication de son contact
WhatsApp. Sans consentement (valeur par défaut), le comportement reste celui d'origine — admin
uniquement. Motivation : au Maroc, WhatsApp est le canal de vente standard des commerces informels ;
l'interdiction totale d'affichage empêchait un usage commercial de base que le vendeur lui-même
souhaite. **Deuxième amendement conscient** à la liste fermée du contrat (le premier était l'espace
membre du 16/07/2026, §4 ci-dessous) — décision produit, pas une dérive.

## 4 — Contrat API v1

**Erreurs** — format unique partout :
```json
{ "error": { "code": "NOT_FOUND", "message": "Deal introuvable" } }
```
Codes en `SCREAMING_SNAKE_CASE` anglais : `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
`VALIDATION_ERROR`, `RATE_LIMITED`.

**Pagination** — curseur, jamais offset (le tri par score/date change en continu, l'offset
décale ou duplique des résultats entre deux pages).
```
GET /api/v1/deals?cursor=xxx&limit=20  →  { "data": [...], "nextCursor": "yyy" | null }
```

**Endpoints — liste fermée** :

```
# Public, lecture (sans auth)
GET  /api/v1/deals                          liste (filtres: statut=publie par défaut, enseigne, ville, categorie, type)
GET  /api/v1/deals/:publicId                détail
GET  /api/v1/enseignes                      liste des enseignes
GET  /api/v1/deals/:publicId/commentaires   liste, pagination par curseur — ajouté en Phase 4 :
                                             lecture symétrique du POST ci-dessous, omission du
                                             contrat initial (aucun autre endpoint n'était prévu
                                             pour afficher les commentaires soumis)

# Authentifié (requireUser)
POST   /api/v1/deals                        soumission → statut=en_attente
POST   /api/v1/deals/:publicId/votes        body: { sens: "chaud"|"froid" } — upsert
DELETE /api/v1/deals/:publicId/votes        retirer son vote
POST   /api/v1/deals/:publicId/commentaires
GET    /api/v1/me                           profil courant (pseudo, email, couleurAvatar, publicId, compteurs)
PATCH  /api/v1/me                           body: { pseudo?, couleurAvatar? }
DELETE /api/v1/me                           suppression de compte (anonymisation des commentaires,
                                             deals conservés avec submitter_id null, suppression du
                                             compte auth)

# Admin (requireAdmin)
GET    /api/v1/admin/deals                  pipeline complet (auto_draft en premier)
PATCH  /api/v1/admin/deals/:publicId        édition complète du deal + statut (voir §3, amendement du 19/07/2026)
POST   /api/v1/admin/deals/bulk             actions groupées
POST   /api/v1/admin/deals/:publicId/image-depuis-lien
                                             récupère l'image produit depuis le lien du deal
                                             (og:image/twitter:image/image_src) — ajouté le
                                             19/07/2026, troisième amendement conscient
```

**Notes** :
- Amendement du 16/07/2026 — espace membre : exercice des droits d'accès/rectification/effacement
  (loi 09-08). Premier amendement conscient de la liste fermée.
- Amendement du 18/07/2026 — consentement WhatsApp public (deuxième amendement conscient, voir §3) :
  `whatsapp_contact` apparaît publiquement (`GET /api/v1/deals`, `GET /api/v1/deals/:publicId`) **si
  et seulement si** le soumetteur a explicitement consenti à sa publication (`whatsapp_public =
  true`). Sans consentement, la règle d'origine s'applique inchangée : admin uniquement (`GET`/`PATCH
  /api/v1/admin/deals`). Absent du payload public quand non consenti — jamais `null`, l'exposition
  conditionnelle ne doit pas se détecter en creux par la présence d'une clé à valeur nulle.
- Le pipeline (`apps/pipeline`, `.mjs`) écrit **directement en base**, hors `/api/v1` — exception
  documentée (script d'infra dans un environnement de confiance), pas une entorse au principe
  « toutes les écritures utilisateur passent par l'API ».
- Amendement du 19/07/2026 — édition curateur complète + récupération d'image (troisième
  amendement conscient, voir §3) : `PATCH /api/v1/admin/deals/:publicId` couvre désormais tout
  le domaine métier du deal, pas seulement le statut. `POST /api/v1/admin/deals/:publicId/image-depuis-lien`
  ajouté au même amendement : le serveur fetch la page du `lien` existant du deal (jamais fourni
  par l'appelant, toujours relu depuis la base), en extrait une image (og:image, repli
  twitter:image, repli `<link rel="image_src">`), la traite (sharp, resize ≤1200px, WebP q80) et
  écrit `image_key` — même convention de clé (`deals/{public_id}.webp`) et même bucket
  (`deals-images`) que le pipeline. Fonctionne sur un deal `publie` comme `en_attente` (aucun
  filtre de statut) — cas de rattrapage d'un deal déjà publié sans photo.
  - **Garde SSRF stricte** (apps/web/src/app/api/v1/_lib/ssrf.ts) : ce endpoint fait fetcher au
    serveur une URL dérivée d'un `lien` potentiellement soumis par un utilisateur non admin lors
    de la soumission d'origine — avant CHAQUE requête réseau (la page ET l'image, y compris
    chaque hop de redirection revalidé), seuls `http`/`https` sont autorisés et l'hôte résolu est
    rejeté s'il pointe vers une IP privée/loopback/link-local/de métadonnées (RFC1918, `127.0.0.0/8`,
    `169.254.0.0/16`, `::1`, `fc00::/7`). Redirections plafonnées à 3 hops. Timeouts et plafonds de
    taille (5 Mo HTML, 10 Mo image) appliqués en streaming, pas sur la seule foi d'un
    `Content-Length` déclaré.
  - **Limite de cache edge acceptée** : la route proxy `/img/deals/[publicId]` sert avec
    `s-maxage=2592000` (30 jours, §6). Un remplacement d'image via ce endpoint peut donc mettre
    jusqu'à 30 jours à apparaître publiquement si une version précédente était déjà en cache edge
    — pas de purge active. Non problématique pour le cas initial (deal sans image, aucun cache
    préexistant à purger) ; limite acceptée pour le cas replacement, pas un objectif de cet
    amendement.
- Rate limiting (Phase 3) ciblé sur les écritures non-admin (`POST votes/commentaires/deals`).
- Vote et commentaire modélisés comme **sous-ressources** de deal (pas de ressources de premier
  niveau `/votes`, `/commentaires`) — un vote n'existe jamais sans son deal.

## 5 — Interface du module auth

```ts
type AuthUser = {
  id: string;        // uuid interne — ne sort JAMAIS d'une réponse API
  publicId: string;  // seul identifiant exposé
  pseudo: string;
  isAdmin: boolean;
};

getCurrentUser(request: Request): Promise<AuthUser | null>
requireUser(request: Request): Promise<AuthUser>   // throw AuthError('UNAUTHENTICATED')
requireAdmin(request: Request): Promise<AuthUser>  // throw AuthError('FORBIDDEN')
```

- Reconnaît **cookie de session** (web) **et** header **`Authorization: Bearer`** (mobile) dès
  Phase 2 — évite un retrofit de chaque endpoint le jour de l'app mobile.
- Rien d'autre ne sort du module (pas de `hasVoted()`, pas de profil étendu — ça, c'est de la
  donnée métier normale via l'API).
- Appelé uniquement depuis `/api/v1`, jamais directement par un composant web ou le pipeline.

### Doctrine d'accès admin

- Pas de sous-domaine, pas d'URL secrète : `/admin` est public en tant qu'URL,
  la sécurité vient de l'authentification, jamais de l'obscurité.
- Le layout `apps/web` `/admin/*` appelle `requireAdmin()` côté serveur avant
  tout rendu. Non connecté → redirect `/connexion?next=/admin`. Connecté
  non-admin → **404** (pas 403 : ne pas confirmer l'existence de la surface).
- Aucun composant, lien ou fragment HTML admin n'est envoyé à un non-admin.
  Le lien admin dans la nav est rendu conditionnellement **côté serveur**
  (jamais un `if` dans du JS client, contrairement au bouton admin v1).
- Chaque route `/api/v1/admin/*` revérifie `requireAdmin()` indépendamment —
  l'UI n'est jamais la barrière.
- `/admin/*` : noindex + Disallow robots.txt (déjà acté §2).
- La garde vit dans le layout **ET** dans chaque page `/admin/*` qui rend du
  contenu : layouts et pages rendent en parallèle (App Router), une garde de
  layout seule n'empêche pas l'émission du payload RSC de la page.
- Les métadonnées statiques (`export const metadata`) sont résolues par
  Next.js hors du rendu de la page, donc hors de portée de toute garde posée
  dans le corps du composant — toute page `/admin/*` utilise
  `generateMetadata()` (fonction) avec la garde en tête, jamais un objet
  `metadata` statique.

## 6 — Schéma d'URL des images

`fidwastafid.com/img/deals/[public_id]` — proxifié et caché par Cloudflare, backend interchangeable.
En base, `deals.image_key` stocke un chemin/clé interne, jamais une URL Supabase Storage directe.
Cohérent avec la règle : jamais d'`id` séquentiel exposé, y compris dans une URL d'image.

Nuance factuelle (15/07/2026) : en phase Vercel (Cloudflare en DNS-only, pas en proxy orange
cloud), le cache edge de la route `/img/deals/[public_id]` est assuré par le CDN Vercel via
`s-maxage`, pas par Cloudflare. Le cache Cloudflare devient effectif à la bascule VPS (Phase 9),
quand le domaine repasse en proxifié. L'esprit du contrat (cache edge, backend interchangeable)
est inchangé — seul l'opérateur de cache diffère selon la phase d'hébergement.

## 7 — Conventions base de données

- Nommage tables/colonnes en français (continuité de l'existant).
- Migrations SQL versionnées dans le repo — plus jamais de SQL manuel en prod.
- Nouvelles valeurs d'enum en français ; `auto_draft` excepté (historique, voir section 3).
- La CI vérifie en lecture seule la cohérence bidirectionnelle entre
  `packages/db/migrations/` et `schema_migrations` de la prod. Un écart =
  CI rouge. L'application des migrations en prod reste un geste humain
  via le runner (`pnpm migrate`) — la CI ne modifie jamais la prod.

## 8 — Design tokens (déjà tranchés, non-négociables)

Palette rouge/or/crème, typographie Scheherazade New, sceau calligraphique arabe.
Référence directe pour la config Tailwind de la Phase 4.

---

## Ce que ce contrat NE couvre PAS (volontairement)

- Mécanique de maintenance du compteur `score` (recalcul sync/async) — détail d'implémentation Phase 2/3.
- Refresh de token — détail d'implémentation Phase 2.
- Redirection best-effort des anciens liens `#deal-{id}` déjà partagés — jugée inutile, le site n'est
  pas encore réellement utilisé en prod.
- Table dédiée ville/catégorie avec contenu enrichi — reportée, activable sans casse si le besoin émerge.
