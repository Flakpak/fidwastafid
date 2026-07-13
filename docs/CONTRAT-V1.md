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

# Admin (requireAdmin)
GET    /api/v1/admin/deals                  pipeline complet (auto_draft en premier)
PATCH  /api/v1/admin/deals/:publicId        { statut: "publie"|"rejete"|... }
POST   /api/v1/admin/deals/bulk             actions groupées
```

**Notes** :
- `whatsapp_contact` n'apparaît **jamais** hors de `GET /api/v1/admin/deals`.
- Le pipeline (`apps/pipeline`, `.mjs`) écrit **directement en base**, hors `/api/v1` — exception
  documentée (script d'infra dans un environnement de confiance), pas une entorse au principe
  « toutes les écritures utilisateur passent par l'API ».
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

## 6 — Schéma d'URL des images

`fidwastafid.com/img/deals/[public_id]` — proxifié et caché par Cloudflare, backend interchangeable.
En base, `deals.image_key` stocke un chemin/clé interne, jamais une URL Supabase Storage directe.
Cohérent avec la règle : jamais d'`id` séquentiel exposé, y compris dans une URL d'image.

## 7 — Conventions base de données

- Nommage tables/colonnes en français (continuité de l'existant).
- Migrations SQL versionnées dans le repo — plus jamais de SQL manuel en prod.
- Nouvelles valeurs d'enum en français ; `auto_draft` excepté (historique, voir section 3).

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
