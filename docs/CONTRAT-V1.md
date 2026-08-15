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
  Jamais de 404/410 sur un deal expiré — c'est un actif SEO, pas une suppression. **Précisé le
  12/08/2026, dix-huitième amendement conscient, voir ci-dessous** : cette garantie protège un deal
  **ayant été publié**. Un `auto_draft` jamais validé, expiré automatiquement sans être passé par
  `publie`, reste tout aussi vivant (200, jamais supprimé) mais n'est pas un actif SEO — il n'a
  jamais été montré à personne.
- **Prix retiré du slug** (divergence vs plan initial) : un deal est éphémère, son URL est éternelle ;
  le prix vit dans le contenu de la page et les données structurées `Offer` (Phase 5), pas dans l'URL.

**Amendement du 12/08/2026 — indexabilité des deals expirés conditionnée à une publication réelle
(dix-huitième amendement conscient).** Fait générateur : état des lieux SEO du 08/08/2026 puis mesure
en production le 12/08/2026 — 681 des 802 URLs de deals que le sitemap déclarait n'avaient **jamais**
été publiées (`auto_draft` expirés automatiquement après 14 jours, `expirer-auto-draft.mjs`, sans
jamais passer par `publie`). La garantie « URL vivante à vie » ci-dessus protège un actif SEO réel —
une page qui a existé publiquement, potentiellement partagée — pas un brouillon jamais validé.

- **`HTTP 200` et absence de suppression restent universels** : un `expire` jamais publié reste
  accessible à vie, exactement comme avant cet amendement. Rien ne change côté accessibilité —
  seule l'**indexabilité** (balise `robots`) se précise.
- **Critère unique de publication réelle : `deals_protection`** (migration 0015, lot 3) —
  `protege = true` dès qu'une trace d'audit prouve une transition vers `publie` (ou une diffusion
  communautaire, preuve indépendante). Un seul critère, partagé par le sitemap
  (`apps/web/src/app/sitemap.xml/route.ts`) et la balise `robots` de la fiche deal
  (`estActifSeo(statut, protege)`, `_lib/deals.ts`) — deux définitions de « jamais publié »
  dériveraient un jour, exactement le défaut que `deals_protection` existe déjà pour éviter côté
  purge (lot 3/5).
- **`publie` reste toujours indexable** — il l'est par construction : passer en `publie` EST la
  transition que `deals_protection` détecte, `protege` y est donc toujours vrai.
- **`expire` protégé (a été publié) reste toujours indexable** — c'est exactement l'actif SEO que
  cette règle protège depuis l'origine.
- **`expire` non protégé (jamais publié) devient `noindex`** — `{ index: false, follow: false }`,
  même convention que les autres routes non indexables (§2). La page reste servie normalement, le
  maillage interne (fiche → enseigne, fiche → deals liés) ne pointe jamais vers un deal dans cet
  état — ces deux chemins ne surfacent que des `publie` par construction (`fetchDealsLies`,
  `enseigne/[slug]`), jamais un `expire`.

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
- **`motif_rejet`** (texte, **admin uniquement en écriture**) — raison d'un rejet, saisie
  par le curateur, visible par le soumetteur dans son espace membre (`GET /api/v1/me`) : la
  communauté doit comprendre pourquoi son deal n'a pas été publié, pas juste constater le rejet.

  **Amendement du 2026-07-27 — le motif n'est plus optionnel.** Fait générateur : au premier
  rejet réel en production (deal `iih7fmypny`), `motif_rejet` est resté `NULL`. Le champ
  existait et fonctionnait ; il vivait au fond du panneau « Éditer le deal », replié, alors que
  le bouton « Rejeter » était en haut de la carte — on pouvait rejeter sans jamais le voir.
  Un droit du soumetteur ne peut pas dépendre de l'agencement d'un formulaire, ni du zèle du
  curateur : *un champ justifié par le droit de comprendre ne peut pas être facultatif.*
  - **Contrainte applicative, pas DB** : la colonne reste `null`-able. Les lignes historiques ont
    légitimement `NULL` (129 deals rejetés avant cette date) et une contrainte `NOT NULL`
    obligerait à leur inventer un motif — exactement le genre de mensonge que ce contrat refuse
    ailleurs (§« jamais de prix deviné »). Aucune migration pour ce lot.
  - **Vérifiée sur l'état RÉSULTANT**, comme la cohérence physique/en_ligne : rejeter exige un
    motif, mais éditer un deal déjà rejeté et déjà motivé n'a pas à le renvoyer
    (`motifRejetManquant`, `packages/schemas`).
  - **Les deux chemins d'écriture** sont couverts : `PATCH /api/v1/admin/deals/:publicId` **et**
    `POST /api/v1/admin/deals/bulk` (motif commun au lot). Une garantie qui ne tient que sur un
    chemin sur deux n'est pas une garantie.
  - **Raccourcis obligatoires côté back-office** : six motifs préenregistrés en un clic + champ
    libre. Un champ obligatoire sans raccourci se remplit de « x » — l'obligation seule déplace
    le problème au lieu de le régler.

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

**Extension du 19/07/2026 — upload manuel de secours** : certaines sources bloquent la
récupération serveur d'`image-depuis-lien` (Jumia et similaires renvoient 403 aux IP
datacenter, y compris depuis Vercel en prod — constaté en vérification). `POST
/api/v1/admin/deals/:publicId/image` complète le même amendement : upload manuel
(`multipart/form-data`) depuis le formulaire d'édition, sans dépendre du `lien` du deal ni
d'aucun fetch serveur sortant. Le traitement + stockage (sharp, resize ≤1200px, WebP q80,
upload `deals-images`) est factorisé dans un module partagé
(`apps/web/src/app/api/v1/_lib/dealImage.ts`) commun aux deux endpoints — même résultat, même
convention de clé, quelle que soit la voie d'entrée. Le fichier reçu est d'abord identifié par
ses premiers octets (magic bytes JPEG/PNG/WebP), jamais par son Content-Type déclaré
(falsifiable) ; seul le WebP ré-encodé par sharp est stocké, jamais le fichier original — le
ré-encodage neutralise tout contenu malveillant qui y serait embarqué. Limite 5 Mo, rejet
propre au-delà.

**Amendement du 21/07/2026 — taxonomie v2 (cinquième amendement conscient de la liste
fermée)** : la grille de 8 catégories (`Alimentaire`, `Électroménager`, `High-Tech`, `Mode`,
`Maison`, `Beauté`, `Sport`, `Autre`) s'étend à 12, +4 valeurs alimentables par le futur
pipeline multi-sources : `Téléphonie & Internet`, `Gaming`, `Bricolage & Jardin`, `Voyages`.
Les 8 valeurs existantes sont conservées à l'identique (libellés, casse, valeurs stockées) —
aucun renommage, aucune migration de données. Exactement le cas anticipé plus haut dans cette
section (*« enum zod fermé, pas de table dédiée en v1 — upgradable sans casse »*) : `categorie`
est une colonne `text not null` sans contrainte DB (ni enum PostgreSQL, ni CHECK), contrainte
fermée uniquement côté zod (`packages/schemas`) — aucune migration SQL pour ce lot. La
catégorie reste hors schéma d'URL en v1 (`/categorie/[slug]` demeure réservé, non actif, §2) :
extension purement applicative, zéro impact SEO structurel. Décision produit du 21/07/2026 —
explicitement bornée à ces 4 valeurs, pas de catégorie `Enfants`/`Famille` (pas sans données,
voir `IDEES.md`).

**Amendement du 18/07/2026 — consentement WhatsApp public** : la règle "`whatsapp_contact`
n'apparaît jamais hors admin" (ci-dessous, §4) est remplacée par une règle conditionnée au
consentement du soumetteur — voir §4. `deals` gagne **`whatsapp_public`** (booléen, `not null default
false`) : `true` uniquement si le soumetteur a explicitement consenti à la publication de son contact
WhatsApp. Sans consentement (valeur par défaut), le comportement reste celui d'origine — admin
uniquement. Motivation : au Maroc, WhatsApp est le canal de vente standard des commerces informels ;
l'interdiction totale d'affichage empêchait un usage commercial de base que le vendeur lui-même
souhaite. **Deuxième amendement conscient** à la liste fermée du contrat (le premier était l'espace
membre du 16/07/2026, §4 ci-dessous) — décision produit, pas une dérive.

**Amendement du 05/08/2026 — suppression douce (dixième amendement conscient, plan « suppression
administrative des deals », lot 1).** `deals` gagne **`supprime_le`** (`timestamptz`, nullable, sans
défaut) : `null` = visible, une date = supprimé à cet instant. **Jamais de `DELETE` réel sur
`deals`** — sans PITR (une seule sauvegarde, artefact GitHub 30 jours), une suppression dure serait
irréversible en pratique ; `supprime_le` transforme le geste en `UPDATE`, défait par un autre
`UPDATE`. Neutralise au passage le `ON DELETE CASCADE` de `votes`/`commentaires`/`diffusions` sur
`deals` : la ligne n'étant jamais réellement supprimée, ces tables ne perdent jamais rien.

- **Exclusion exhaustive.** Toute lecture, publique ou admin, exclut `supprime_le is not null` :
  feed, fiche, page enseigne, sitemap, proxy d'image, commentaires, compteurs (`/deals/compte`,
  `/admin/deals/compte`), file de modération, doublons admin, verrou de vote, `/me`. Le seul endroit
  qui lit délibérément l'inverse est `GET /api/v1/admin/deals?supprime=true` (§4) — l'onglet dédié.
  Le pipeline (dédoublonnage, expiration auto des `auto_draft`) exclut aussi les lignes supprimées :
  une ligne masquée ne doit ni bloquer une réinsertion, ni changer de statut pendant qu'elle est
  invisible (sinon une restauration ultérieure mentirait sur le statut d'origine).
- **Règle de repli, gravée ici pour de bon** (préparatoire au lot 3 — le critère de protection
  contre la purge à venir n'est PAS le statut, mais l'existence d'une trace de publication dans
  `journal_audit`) : **en cas de doute ou d'absence de trace d'audit, un deal est toujours considéré
  comme protégé. Jamais l'inverse.** Une classification qui hésite entre « protégé » et « supprimable »
  choisit protégé, systématiquement — un faux positif coûte une ligne de plus en base, un faux négatif
  coûte un actif SEO ou une preuve.

**Amendement du 05/08/2026 — mémoire de curation (onzième amendement conscient, lot 2).** Bug actif
corrigé, pas seulement une préparation : le dédoublonnage du pipeline (`insert-deals.mjs`) matchait
sur titre+enseigne+**prix_promo** — un deal rejeté par l'admin revenait dès que le vendeur changeait
son prix de quelques dirhams, la décision ne survivant pas à la ligne rejetée.

Nouvelle table **`memoire_curation`** (migration 0014) : `empreinte` + `decision` (`'rejete'` seule
valeur possible aujourd'hui) + `deal_origine_public_id` (référence **souple**, jamais une FK — la
mémoire doit survivre à ce qu'il advient de la ligne d'origine, y compris sa suppression douce) +
`motif` + `decide_le`/`decide_par`. **Jamais le prix** dans l'empreinte — fonction SQL
`empreinte_curation(lien, titre, enseigne_id)`, **partagée** entre le pipeline (JS) et l'admin web
(TS) : lien produit en priorité (fort, même principe que `DEAL_DOUBLON_JOIN`/`par_lien`), repli sur
titre+enseigne sinon.

- Le pipeline consulte la mémoire **avant** le dédoublonnage titre+enseigne+prix : un produit dont
  l'empreinte porte une décision `rejete` active n'est jamais réinséré.
- L'admin (PATCH unitaire et `bulk`) écrit une entrée à chaque **vraie transition** vers `rejete`
  (jamais sur l'édition d'un deal déjà rejeté, qui écrirait une entrée par correction de motif sans
  nouvelle décision).
- **Rétroactif** : la migration alimente la table depuis les 417 `rejete` déjà en base au moment du
  lot — sans ce rattrapage, la mémoire démarre vide et le bug continue de s'appliquer à tout
  l'historique déjà rejeté. `decide_par` vient de `journal_audit` (entrée la plus récente pour le
  deal) quand elle existe, laissé `NULL` sinon plutôt que deviné.
- **Lever une décision** — `POST /api/v1/admin/memoire-curation/:id/lever` (§4) : répond à la
  question « un deal rejeté puis légitimement republié par l'enseigne à un autre moment, que
  devient-il ? ». Sans ce geste, la mémoire serait une liste noire définitive. Lever ne supprime
  rien (même principe que `supprime_le`) : pose `levee_le`/`levee_par`/`levee_motif`, l'entrée reste
  lisible dans l'historique, seul le pipeline cesse de la consulter.

**Amendement du 05/08/2026 — critère de protection contre la purge (douzième amendement conscient,
lot 3).** Vue **`deals_protection`** (migration 0015, lecture seule — aucune ligne de donnée
modifiée) : `protege` (booléen) par `public_id`, calculé, jamais stocké.

Le critère n'est **pas le statut courant** — mesuré : 0 des 430 `expire` de production n'a jamais
été `publie` (le pipeline expire directement un `auto_draft` trop ancien sans passer par `publie`).
Le critère est l'**existence d'une trace de publication dans `journal_audit`**, qui survit à tout
changement de statut ultérieur. Trois voies, dans l'ordre :

1. transition vers `publie` dans `journal_audit`, sous l'une des **deux formes JSON réellement
   rencontrées** (`update_deal` imbrique sous `statut.apres` ; `update_statut` — action historique,
   plus émise par le code actuel mais présente dans l'historique réel — et `bulk_update_statut`
   sont plates, `apres` à la racine) ;
2. une diffusion communautaire (`diffuser_telegram`/`diffuser_discord`), preuve indépendante — ne
   peut arriver que sur un deal `publie` (garde côté API) ;
3. **repli protecteur** : toute action `journal_audit` d'un type **non énuméré** par les deux voies
   ci-dessus est un doute, pas une absence — protégée. La liste des actions non probantes (édition
   hors statut, diffusion annulée, image, suppression douce, restauration) est fermée ; une action
   future non listée y bascule automatiquement, sans modification de cette vue.

**Résistance au contournement vérifiée** (test d'intégration) : un deal publié puis rétrogradé en
`auto_draft` reste protégé — l'historique ne s'efface jamais, seul le statut courant change.

**Classification mesurée sur la production (05/08/2026)** — chiffre qui dimensionne les lots 4 et 5 :

| Statut | Protégées | Purgeables |
|---|---|---|
| `publie` | 113 | 0 |
| `rejete` | 2 (ont été publiées, puis retirées) | 415 |
| `auto_draft` | 0 | 643 |
| `expire` | 0 | 430 |
| `en_attente` | 0 | 2 |
| **Total** | **115** | **1490** |

**Amendement du 05/08/2026 — purge d'images (treizième amendement conscient, lot 4).** Le seul geste
irréversible de tout le plan « suppression administrative des deals » : contrairement à
`supprime_le` (lot 1) et `memoire_curation.levee_le` (lot 2), un fichier Storage réellement effacé ne
revient pas. Construit **désarmé** — voir plus bas.

`deals` gagne **`image_purgee_le`** (`timestamptz`, nullable, migration 0016). `image_key` **n'est
jamais effacé** : il reste la trace historique de ce qui existait ; seul `image_purgee_le` fait foi
de ce qui est réellement récupérable. `toDeal()`/`toDealAdmin()` (`_lib/deals.ts`) et
`resolveDealImageKey()` (`_lib/lookup.ts`) masquent l'image dès que `image_purgee_le` est renseigné,
quel que soit l'état de `supprime_le`.

**Question posée à la conception : que devient une ligne purgée puis restaurée ?** `POST
.../restaurer` (lot 1) n'efface que `supprime_le`, jamais `image_purgee_le` — la ligne redevient
visible **sans image**, jamais avec un lien mort servi comme si le fichier existait encore. Vérifié
par test d'intégration (`apps/web/tests/integration.ts`) : après restauration, la fiche publique
reste 200 (deal `expire`, actif public), `imageKey` est absent du payload, et la route proxy
`/img/deals/[publicId]` répond 404 plutôt que de tenter de servir un fichier disparu.

Script `apps/pipeline/purger-images.mjs`, double garde-fou :

1. **Délai de 90 jours** après `supprime_le`, pas 30 — l'artefact de backup GitHub ne vit que 30
   jours (`db-backup.yml`). Purger avant créerait une fenêtre où une restauration serait incomplète
   et silencieuse : le deal revient, son image non.
2. **Double condition, jamais une seule** : `supprime_le is not null` **ET**
   `deals_protection.protege = false` (lot 3, même repli protecteur — tout doute protège).

**Désarmé par défaut** : `PURGE_IMAGES_ACTIF` absent (ou différent de `"true"`) → le job rapporte
(nombre de fichiers, volume) sans effacer un seul octet de Storage, sans poser `image_purgee_le`,
sans écrire au `journal_audit`. `.github/workflows/purge-images.yml` n'a **aucun déclencheur
`schedule:`**, volontairement — contrairement au backup et au pipeline quotidien, ce job ne doit
jamais tourner tout seul avant que l'activation ait été une décision explicite et nommée ;
`workflow_dispatch` uniquement, avec `actif` (faux par défaut) et `delai_jours` (permet de simuler
un autre délai, ex. `0` pour « qu'est-ce qui serait purgé aujourd'hui » — ce réglage ne touche que la
sélection des candidats, jamais `actif`). Vérifié en lecture seule sur la production le 05/08/2026 :
0 ligne actuellement en suppression douce, donc 0 fichier candidat quel que soit le délai simulé —
attendu, aucune ligne n'a encore atteint le seuil.

**Attribution `journal_audit`** : première écriture non portée par un admin humain. Utilisateur
système **`Pipeline`** (`00000000-0000-0000-0000-000000000001`, `public_id` `systemepq2`, inséré par
la migration 0016) — sans ligne dans `admins`, aucun accès, seulement une identité de traçabilité.
Une entrée par run actif (jamais en mode à blanc), `cible_type = 'deals_purge'`, `details` porte le
compte de fichiers, le volume et la liste des `public_id` traités.

**Alerte en cas d'échec réutilisée, jamais dupliquée** : `.github/actions/alerte-issue` (même
mécanisme que le backup et le pipeline quotidien) — un job de purge muet qui échoue laisserait croire
au nettoyage.

**Durcissement du 05/08/2026 — le DELETE Storage éprouvé pour de vrai.** Le seul geste irréversible
de tout le dispositif était aussi le seul qu'aucun test n'exerçait — comblé avant le lot 5, sur un
préfixe Storage de test isolé (`test-purge/`, hors du motif `deals/{publicId}.webp` : ne peut jamais
être l'image réelle d'un deal), jamais un fichier de production (`apps/pipeline/verifier-purge-storage.mjs`,
script de vérification manuelle, pas un test CI — il déclenche de vrais appels contre le vrai projet
Supabase, volontairement, faute d'émulateur Storage).

- **Constat empirique** : Supabase Storage encapsule un `DELETE` sur une clé absente sous un **HTTP
  400 générique**, jamais un 404 — le vrai statut sémantique vit dans le corps JSON
  (`code: "NoSuchKey"`). Un fichier déjà absent est désormais traité comme un **succès** (l'état
  visé est atteint), jamais une erreur — sinon un candidat dont le fichier a disparu pour toute
  autre raison (run précédent interrompu, suppression manuelle) resterait bloqué à l'identique à
  chaque tentative.
- **Le pire cas nommé par la conception — DELETE Storage abouti, écriture du marqueur qui échoue ou
  n'affecte aucune ligne (« image détruite, base croit qu'elle existe »)** — est désormais
  **impossible à masquer** : `purgerImages()` vérifie que l'`UPDATE` de `image_purgee_le` affecte
  exactement une ligne et lève immédiatement sinon, sans écrire au `journal_audit`. Le run s'arrête
  bruyamment, l'alerte part. Combiné au point précédent, le système **converge** au run suivant : le
  candidat reste sélectionné (marqueur toujours `null`), le nouveau `DELETE` retrouve le fichier déjà
  absent (`NoSuchKey` = succès), la pose du marqueur est retentée — jamais une nouvelle tentative de
  suppression sur un fichier déjà détruit.
- **Ordre non négociable, jamais l'inverse** : taille (best effort) → `DELETE` Storage → `UPDATE`
  marqueur. Marquer avant d'avoir confirmé la suppression risquerait l'erreur symétrique (marqué
  purgé alors que le fichier existe encore) — écartée par construction.
- **Quatre scénarios vérifiés pour de vrai**, pas seulement raisonnés : suppression nominale
  (fichier réel détruit, marqueur posé), fichier déjà absent au départ (aucune exception, marqueur
  posé quand même), Storage en erreur réelle (clé API invalide — lève, marqueur jamais posé, fichier
  intact), et le pire cas ci-dessus (client-façade pour forcer l'échec du seul `UPDATE`, tout le
  reste — le `DELETE` Storage — passe par le vrai réseau).

**Amendement du 05/08/2026 — purge automatique des lignes (quatorzième amendement conscient, lot 5).**
Automatise ce que le lot 1 permet à la main : `apps/pipeline/purger-lignes.mjs` pose `supprime_le`
(EN SUPPRESSION DOUCE, jamais un `DELETE`) sur les lignes dormantes jamais publiées. Réversible par
construction — contrairement au lot 4, aucun geste irréversible ici : une ligne auto-supprimée se
restaure exactement comme une ligne supprimée à la main.

**Périmètre restreint, PAS les 1490 lignes purgeables de la classification lot 3 — deux exclusions
volontaires :**

- **`expire` exclu.** CONTRAT-V1 §1 grave « URL vivante à vie, jamais de suppression » pour un deal
  expiré — un actif SEO indexé. Un admin peut déjà le supprimer à la main (lot 1) ; l'automatiser à
  l'échelle contredirait l'esprit de cette règle gravée. **Question tranchée explicitement** avant
  toute construction, pas une omission découverte après coup.
- **`en_attente` exclu.** File de modération humaine active — le supprimer automatiquement ferait
  disparaître une soumission jamais jugée par un admin, sans qu'aucun humain ne l'ait vue. Ne
  concerne que 2 lignes aujourd'hui ; exclu par principe, pas par volume.

Périmètre retenu : `rejete` et `auto_draft`, jamais publiés (`deals_protection.protege = false`,
double condition, jamais une seule), dormants depuis `DELAI_JOURS_PURGE_LIGNES` (**60 jours** depuis
`created_at` — valeur choisie, pas imposée : nettement en dessous des 90 jours du lot 4 puisque
c'est une décision réversible, nettement au-dessus d'un cycle de curation normal). En pratique,
`auto_draft` s'auto-expire déjà en `expire` après 14 jours (`expirer-auto-draft.mjs`) — un
`auto_draft` encore présent après 60 jours de dormance est donc rarissime, sans être structurellement
exclu ici.

**`journal_audit` réutilise l'action `supprimer_deal`** (déjà classée non-probante par
`deals_protection`, migration 0015) plutôt qu'un nouveau type d'action — `details.automatise: true`
fait la différence avec le geste manuel. Inventer une action distincte aurait exigé une nouvelle
migration pour l'ajouter à la liste fermée (repli protecteur sinon, lot 3), sans bénéfice : c'est le
même fait côté domaine, qu'un humain ait cliqué ou qu'un cron ait tourné.

**Désarmé par défaut**, mêmes conventions que le lot 4 : `PURGE_LIGNES_ACTIF` absent/faux → rapporte
(nombre de lignes, par statut) sans écrire. `.github/workflows/purge-lignes.yml`, `workflow_dispatch`
uniquement, aucun `schedule:`. Alerte réutilisée (`.github/actions/alerte-issue`).

**Chiffres mesurés en lecture seule sur la production le 05/08/2026** — c'est ce qui décide de
l'armement :

| | Délai simulé 0 jour (aucune dormance exigée) | Délai réel 60 jours |
|---|---|---|
| `auto_draft` | 642 | 0 |
| `rejete` | 415 | 0 |
| **Total** | **1057** | **0** |

**0 ligne au délai réel** : rien n'a encore 60 jours de dormance (projet Supabase créé le
12/07/2026) — attendu, pas un bug. Le chiffre à 1057 dit la taille du bassin qui s'accumulera
progressivement ; c'est lui qui doit être regardé avant toute décision d'armer, pas le 0 d'aujourd'hui.

**Amendement du 05/08/2026 — recherche insensible aux accents (quinzième amendement conscient).**
Fait générateur : « electromenager » ne trouvait jamais un deal dont le titre contient
« Électroménager » — `ILIKE` (paramètre `q`, `_lib/dealsFilters.ts`) est déjà insensible à la casse,
jamais aux accents. Vérifié en lecture seule sur la production le 05/08/2026, cas réel : 3 deals
`publie` contiennent « crêpière » dans leur titre, 0 trouvés en cherchant « crepiere » (sans accent).

Extension **`unaccent`** (migration 0017), schéma `public` — pas `extensions` (convention Supabase
pour pgcrypto/uuid-ossp) : cette migration doit s'appliquer identiquement sur Supabase ET sur un
Postgres nu (local, CI, VPS cible, CONTRAT-V1 §7), qui n'a pas de schéma `extensions`.

- **`unaccent()` appliqué aux DEUX côtés de la comparaison** (le motif ET les trois colonnes déjà
  interrogées : `titre`, `enseigne.nom`, `enseigne.slug`) — symétrique par construction, jamais deux
  chemins de code séparés pour « la requête a des accents » et « le contenu en a » : peu importe
  lequel des deux, la comparaison passe toujours par la même transformation des deux côtés.
- **AUCUN INDEX créé — décision délibérée, pas un oubli.** Un index expression btree sur
  `unaccent(titre)` n'accélérerait PAS `ilike '%motif%'` (joker en tête ET en queue, jamais un
  préfixe) : seul un index trigramme (`pg_trgm`) le ferait. **`pg_trgm` et le classement par
  pertinence sont explicitement HORS PÉRIMÈTRE** de ce lot (113 deals : gain non mesurable,
  complexifierait le curseur de pagination — CONTRAT-V1 §4, « le curseur embarque la signature des
  filtres » — sans bénéfice observable). Un index qui ne sert à rien en lecture coûterait quand même
  à chaque écriture du pipeline (insertion en volume, quotidienne) : la décision retenue est un coût
  d'écriture **nul** — vérifié après migration, `\d deals` ne montre aucun index nouveau, le jeu
  d'index reste identique à avant ce lot.
- **Testé sur des cas réels** (fixtures d'intégration délibérément asymétriques — l'une porte les
  accents dans le titre, l'autre dans la requête, pour que le test ne puisse pas réussir par
  coïncidence) : « electromenager » trouve « Électroménager », « café »/« crêpière » (avec accent)
  trouvent des titres écrits sans accent, et réciproquement — les deux sens vérifiés séparément.
  « Électroménager » n'apparaît littéralement dans aucun titre de production à ce jour (c'est une
  `categorie`, jamais recherchée par `q` — hors périmètre de ce lot, `q` reste titre/enseigne
  uniquement) ; « téléphonie » n'apparaît que sur des deals non publiés — deux constats honnêtes,
  pas des échecs du correctif.

**Amendement du 05/08/2026 — état voté persistant (seizième amendement conscient).** `CardVote`
affichait un état « voté » optimiste, côté client uniquement (score reçu, jamais le vote courant de
l'utilisateur) : au rechargement, un vote déjà émis redevenait invisible. Dette tracée dans
`docs/IDEES.md` depuis la refonte Tadelakt.

**Chemin retenu : endpoint dédié, PAS un enrichissement de `dealSchema`.** Trois chemins évalués —
rendu serveur de la page, endpoint dédié, enrichissement de la charge utile du deal. **`dealSchema`
et `dealAdminSchema` restent inchangés** : le vote courant de l'appelant n'est structurellement pas
une propriété du deal (il dépend de QUI regarde), l'ajouter à `Deal` aurait rendu CE payload
dépendant de l'identité de l'appelant. Concrètement, deux mécanismes distincts, choisis par contexte :

- **Fiche d'un deal seul** (`deal/[slugAndId]/page.tsx`) : résolu **en SSR direct**, une requête
  serveur supplémentaire (le vote de CET utilisateur pour CE deal), zéro appel client, zéro flash.
  `resolveCurrentUser()` est déjà appelé sur cette page pour `SiteHeader` — dédupliqué par requête
  (`cache()`, React) — cette résolution ne coûte donc rien de plus qu'une requête SQL supplémentaire,
  triviale (un seul deal).
- **Feed** (`GET /api/v1/deals`, paginé, servi à des visiteurs anonymes) : **`GET
  /api/v1/deals/mes-votes?ids=...`**, endpoint séparé, appelé côté client, UNIQUEMENT si un
  utilisateur est connecté (`estConnecte`, calculé serveur via `resolveCurrentUser()` et transmis en
  prop — jamais déduit côté client). **Un visiteur anonyme n'émet AUCUNE requête vers ce endpoint** :
  coût strictement nul, `GET /api/v1/deals` reste identique, byte pour byte, à avant ce lot — aucun
  risque pour une éventuelle mise en cache future de ce endpoint (il n'en a pas aujourd'hui : la page
  qui l'appelle est déjà `force-dynamic`, jamais mise en cache par le CDN — vérifié, aucune régression
  possible sur ce point précis).
- Appelé une fois à l'affichage initial ET après chaque « Charger plus » (nouveaux `publicId`
  uniquement) — jamais pour un `publicId` déjà connu.

**Coût mesuré, pas supposé** : `votes` porte aujourd'hui 8 lignes en production (2 utilisateurs) — la
jointure `deals.public_id = any($ids)` (indexée, contrainte `unique`) + filtre `user_id` (non indexé
seul, mais `votes` reste de taille négligeable à l'échelle du projet) est instantanée. Aucun index
nouveau créé — même principe que le lot recherche ci-dessus : pas d'infrastructure sans bénéfice
mesurable. Si `votes` grossit significativement, un index sur `user_id` seul serait le premier geste,
documenté ici pour ne pas le redécouvrir.

**L'état optimiste reste inchangé** : `CardVote` applique le vote reçu du serveur **une seule fois**,
à la première valeur connue (`useRef`) — un clic qui suit n'est jamais écrasé par une réponse serveur
arrivée en retard. **Couvre le vote retiré** : la table `votes` ne garde que l'état courant (pas un
historique) — un vote retiré (`DELETE .../votes`) n'apparaît simplement plus dans la réponse de
`mes-votes`, sans cas particulier à coder.

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
GET  /api/v1/deals                          liste (filtres: statut=publie par défaut, enseigne, ville, categorie, type, q)
GET  /api/v1/deals/compte                   nombre de deals correspondant aux filtres (sans pagination)
                                             — ajouté le 27/07/2026, septième amendement conscient
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
GET    /api/v1/deals/mes-votes?ids=a,b,c    vote courant de l'appelant pour les deals demandés
                                             (50 max) — { votes: { [publicId]: "chaud"|"froid" } },
                                             absent = pas de vote — ajouté le 05/08/2026, seizième
                                             amendement conscient (voir §3, état voté persistant)
POST   /api/v1/deals/:publicId/commentaires
GET    /api/v1/me                           profil courant (pseudo, email, couleurAvatar, publicId, compteurs)
PATCH  /api/v1/me                           body: { pseudo?, couleurAvatar? }
DELETE /api/v1/me                           suppression de compte (anonymisation des commentaires,
                                             deals conservés avec submitter_id null, suppression du
                                             compte auth)

# Admin (requireAdmin)
GET    /api/v1/admin/deals                  file d'UN statut (paramètre requis), pagination par
                                             curseur — ajouté le 05/08/2026, neuvième amendement
                                             conscient (voir ci-dessous). `?supprime=true` bascule
                                             sur l'onglet Supprimés (dixième amendement, voir §3) —
                                             exclusif du paramètre statut, tri par date de
                                             suppression décroissante
GET    /api/v1/admin/deals/compte           compte par statut (neuvième amendement) + `supprimes`,
                                             compte des lignes supprimées (dixième amendement)
GET    /api/v1/admin/deals/compte-filtre    compte EXACT pour un (statut ou `?supprime=true`) +
                                             filtres donnés — lot filtres/tri du 12/08/2026,
                                             manquait de cette liste avant le 15/08/2026, corrigé
                                             au passage du vingtième amendement conscient (voir §3)
PATCH  /api/v1/admin/deals/:publicId        édition complète du deal + statut (voir §3, amendement du 19/07/2026)
DELETE /api/v1/admin/deals/:publicId        suppression DOUCE (pose `supprime_le`, jamais de DELETE
                                             SQL) — dixième amendement conscient, voir §3
POST   /api/v1/admin/deals/:publicId/restaurer
                                             efface `supprime_le` ; renvoie le deal dans son statut
                                             d'origine, jamais touché par la suppression — même
                                             amendement
POST   /api/v1/admin/deals/bulk             actions groupées, sélection manuelle (max 100)
POST   /api/v1/admin/deals/bulk-filtre?statut=...
                                             actions groupées PAR FILTRE, `verbe` limité à
                                             `verbesAutorises(statut)` — lot filtres/tri du
                                             12/08/2026, étendu aux cinq onglets de statut le
                                             15/08/2026 (vingtième amendement conscient, voir §3) ;
                                             manquait de cette liste avant ce jour, corrigé au passage
POST   /api/v1/admin/deals/restaurer-bulk   restauration groupée, sélection manuelle (max 100) —
                                             vingtième amendement conscient, voir §3
POST   /api/v1/admin/deals/restaurer-bulk-filtre
                                             restauration groupée PAR FILTRE (`?supprime=true` +
                                             mêmes filtres que `GET /admin/deals`) — même amendement
GET    /api/v1/admin/memoire-curation       décisions actives (rejete, non levées), plus récentes
                                             d'abord — onzième amendement conscient, voir §3
POST   /api/v1/admin/memoire-curation/:id/lever
                                             lève une décision (jamais un DELETE) — même amendement
POST   /api/v1/admin/deals/:publicId/image-depuis-lien
                                             récupère l'image produit depuis le lien du deal
                                             (og:image/twitter:image/image_src) — ajouté le
                                             19/07/2026, troisième amendement conscient
POST   /api/v1/admin/deals/:publicId/image  upload manuel (multipart/form-data, jpeg/png/webp,
                                             5 Mo max) — fallback si image-depuis-lien est
                                             bloqué par la source ; même amendement du 19/07/2026
POST   /api/v1/admin/deals/:publicId/diffuser/telegram?mode=production|test
DELETE /api/v1/admin/deals/:publicId/diffuser/telegram
POST   /api/v1/admin/deals/:publicId/diffuser/discord?mode=production|test
DELETE /api/v1/admin/deals/:publicId/diffuser/discord
                                             diffusion communautaire, un canal par chemin —
                                             ajouté le 02/08/2026, huitième amendement conscient.
                                             `?mode=` REQUIS sur POST depuis le 08/08/2026,
                                             dix-septième amendement conscient (voir §3) : jamais de
                                             repli automatique vers la production
POST   /api/v1/admin/deals/diffuser-lot?canal=telegram|discord&mode=production|test
                                             crée un lot de diffusion en masse (`publicIds` transmis
                                             par le client — sélection manuelle sur l'onglet Publiés,
                                             jamais un filtre) et fige sa liste cible côté serveur —
                                             ajouté le 15/08/2026, dix-neuvième amendement conscient
GET    /api/v1/admin/deals/diffuser-lot/:lot
                                             état complet du lot (un par un) — même amendement
POST   /api/v1/admin/deals/diffuser-lot/:lot/suivant
                                             traite le prochain deal `en_attente` du lot et persiste
                                             le résultat ; `{ termine: true }` en fin de lot — même
                                             amendement
POST   /api/v1/admin/deals/diffuser-lot/:lot/relancer
                                             remet en file les deals `echoue` du lot (jamais `envoye`
                                             ni `deja_diffuse`) — même amendement
```

**Amendement du 15/08/2026 — diffusion en masse (dix-neuvième amendement conscient,
migration 0021).** La diffusion unitaire (huitième amendement) reste inchangée ; ce lot ajoute
un envoi PAR LOT, sur l'onglet Publiés, sélection manuelle de deals précis (jamais un filtre —
contrairement à `bulk-filtre`, diffuser reste un geste de curation ciblé, pas « tout ce qui
matche X »). `publicIds` figé côté serveur à la création du lot (`creerLot`,
`_lib/diffusionLots.ts`) : un rechargement de la liste affichée ensuite ne change jamais ce
qu'un lot déjà lancé traite.

- **Deux tables neuves** (`diffusion_lots`, `diffusion_lot_deals`, migration 0021), PAS une
  extension de `diffusions` : un lot est un événement d'INTENTION (« diffuser ces N deals, sur
  ce canal, dans ce mode »), distinct de la diffusion individuelle elle-même. La brique
  `diffuser()`/`annuler()` (`_lib/diffusion.ts`) reste l'unique chemin d'écriture réelle dans
  `diffusions` — le lot l'appelle deal par deal, ne duplique jamais ses gardes.
- **Pourquoi une table de progression et pas `journal_audit` comme le rejet en masse** : le
  rejet en masse est synchrone (une seule transaction, borné, terminé avant la réponse HTTP).
  Une diffusion en masse ne peut pas l'être — l'étalement demandé entre deux envois dépasserait
  le délai d'exécution d'une fonction serverless pour un lot de taille réaliste. Le rythme est
  donc tenu **côté client** (l'admin garde l'onglet ouvert, chaque appel à `/suivant` attend le
  délai configuré avant le suivant) ; l'état persiste en base, pas seulement en mémoire du
  navigateur — un rechargement de page ne perd rien et ne renvoie rien de déjà réussi.
- **Statuts explicites** (`en_attente`/`deja_diffuse`/`envoye`/`echoue`), pas un booléen —
  `deja_diffuse` posé à la création du lot, avant tout appel réseau, distingue « déjà diffusé
  en production avant même ce lot » (jamais retraité, jamais un appel réseau superflu) de
  `envoye` (diffusé PAR ce lot). Ne s'applique jamais en mode test.
- **Reprise sans renvoi** : `/suivant` choisit toujours le premier `en_attente` restant, quel
  que soit le nombre d'appels précédents réussis ou de rechargements de page survenus entre
  temps — un deal `envoye`/`deja_diffuse` n'est plus jamais retraité par ce lot.
- **Plancher de l'intervalle mesuré, pas supposé** : Telegram documente explicitement (FAQ
  officielle) au plus 1 message/seconde dans un même chat — notre cas exact, un seul canal
  cible par diffusion. C'est la contrainte la plus stricte des deux plateformes : 1000 ms est
  donc le plancher appliqué côté interface. Discord ne publie aucun chiffre officiel par
  webhook (seulement une limite globale de 50 req/s tous endpoints confondus) ; la pratique
  couramment observée (5 req/2 s par webhook) reste au-dessus de ce plancher. Défaut proposé à
  l'admin : 3 s, large des deux côtés, resserrable jusqu'au plancher sans changement de code.
- **429 détecté sur le texte de l'erreur** (`traiterEchec()` inclut déjà `HTTP {statut}` dans
  le message renvoyé par `diffuser()`) — pas une donnée structurée, aucune des deux plateformes
  n'exposant `Retry-After` jusqu'ici dans `DiffusionRefusError`. Un 429 arrête la boucle côté
  client plutôt que de marteler une plateforme qui vient de refuser pour cette raison ; le
  deal concerné reste `echoue`, relançable comme n'importe quel autre échec.
- **Mode test distinct, ne marque rien** (huitième/dix-septième amendements, inchangés) :
  `diffuser()` n'écrit jamais dans `diffusions` en mode test, donc `deja_diffuse` ne compte
  jamais un envoi de test — un lot de test peut être relancé indéfiniment sans jamais se
  bloquer sur lui-même.
- **Confirmation nommant le nombre de messages, le canal et le mode** avant tout envoi — le
  bouton de lancement porte lui-même ce texte, pas une case à cocher séparée (même principe
  que la confirmation de lot par filtre, neuvième amendement).

**Amendement du 15/08/2026 — « tout sélectionner », généralisé (vingtième amendement
conscient).** La sélection groupée (`bulk`/`bulk-filtre`, neuvième amendement du 12/08/2026)
n'existait que sur `auto_draft`/`en_attente`. Ce lot l'étend, à deux niveaux
distincts, partout où une action groupée a un sens :

- **Niveau 1 — les lignes CHARGÉES** (peut dépasser une page, via « Charger plus »). Une case
  « Tout sélectionner (visible) — N » bascule (jamais une union) : coche tout ce qui est chargé,
  ou décoche tout. Reste une sélection MANUELLE, envoyée par liste de `public_id` (`POST
  /admin/deals/bulk`, plafond 100 déjà en vigueur) — le périmètre est exactement ce que
  l'admin a sous les yeux, jamais plus.
- **Niveau 2 — TOUT le résultat filtré**, explicite dans son libellé, nombre EXACT issu de `GET
  /admin/deals/compte-filtre`, jamais déduit d'une liste chargée. Mécanisme filtre + verbe
  (`POST /admin/deals/bulk-filtre`), jamais une liste d'identifiants — c'est précisément parce
  que `bulk` (niveau 1) est plafonné à 100 que ce niveau ne peut pas être une liste : au-delà de
  100 deals filtrés, il faudrait fragmenter l'appel, exactement ce que `bulk-filtre` (plafond
  2000, neuvième amendement) évite en résolvant les id côté serveur.
- **`verbesAutorises(statut)`** (`_lib/adminDealsActions.ts`) — SOURCE UNIQUE, partagée entre les
  boutons affichés (client) et la validation serveur (`bulk-filtre`) : une action sans objet pour
  l'onglet visé (« expirer » un `rejete`) est un `VALIDATION_ERROR`, jamais acceptée. Étendue aux
  cinq onglets de statut : `auto_draft`/`en_attente` → publier/rejeter (inchangé) ; `publie` →
  expirer/retirer ; `rejete` → republier/remettre en attente ; `expire` → republier.
- **Onglet Supprimés — inclus, avec sa propre paire d'endpoints** (`restaurer-bulk`,
  `restaurer-bulk-filtre`) : un seul verbe possible (restaurer), pas de motif. `GET
  /admin/deals/compte-filtre` étendu au mode `?supprime=true` (même bascule exclusive que `GET
  /admin/deals`) pour lui donner un compte exact. La restauration groupée par filtre réutilise
  `conditionsFiltresAdmin` avec `d.supprime_le is not null` au lieu de `d.statut = $1` — même
  source, prédicat différent.
- **Onglet Lots récents — EXCLU, délibérément.** Ce n'est pas un statut de deal ni une liste de
  deals : chaque ligne y est déjà elle-même un lot d'action groupée passé. Sélectionner puis
  annuler plusieurs lots à la fois multiplierait le rayon d'effet de façon imprévisible (des
  lots différents peuvent toucher des deals qui se chevauchent, porter des motifs différents,
  ou avoir déjà été partiellement défaits) — pas un verbe cohérent à appliquer en masse. Annuler
  reste un geste par lot, un par un.
- **Seuil de confirmation (>20) réservé au niveau 2** — le niveau 1 reste un geste direct dès la
  sélection cochée, comme avant ce lot : borné par ce qui est visible et déjà plafonné à 100 par
  `bulk`, il ne porte pas le même risque qu'une action sur un total invisible.
- **Actions groupées par restauration tracées sous `bulk_restaurer_deal`** (`journal_audit`),
  distinct de `restaurer_deal` (individuel) — nom absent de la liste probante de
  `deals_protection` (migration 0015) : bascule automatiquement en repli protecteur, aucune
  migration nécessaire pour ce lot.
- **Limite assumée, pas construite ici** : un lot de restauration groupée n'apparaît pas dans
  « Lots récents » (qui ne lit que `bulk_update_statut`, une transition de STATUT — restaurer
  n'en touche aucun). Défaire une restauration groupée reste, pour l'instant, un geste par ligne
  (re-supprimer).

**Révision du 15/08/2026 (même amendement) — deux frictions corrigées, un léger changement de
forme sur `restaurer-bulk`/`restaurer-bulk-filtre`.**

- **Filtre appliqué AU CHANGEMENT, comme le tri** — le bouton « Appliquer les filtres » est
  retiré ; seuls les quatre champs numériques (remise/prix min/max) restent débounced (400 ms),
  parce que ce sont les seuls où chaque frappe déclenche `onChange`. Un menu ou une date complète
  ne déclenche qu'un `onChange` par choix, aucun débounce n'y est nécessaire.
- **Plus de reload brutal** — `deals` n'est plus jamais remis à `null` après le premier
  chargement : la liste déjà affichée reste visible (légèrement atténuée) pendant qu'une nouvelle
  page charge, au lieu de disparaître derrière « Chargement… » à chaque changement de
  filtre/onglet/tri. Un compteur de requête (`requeteListeRef`) ignore toute réponse qui n'est
  plus la plus récente — nécessaire dès qu'un filtre peut partir sans confirmation explicite.
- **`bulk-filtre` et `restaurer-bulk-filtre` retirent désormais les lignes touchées EN LOCAL**
  (comme `bulk` depuis #141), au lieu d'un `rafraichir()` complet qui ramenait en page 1 et
  perdait « Charger plus ». Une ligne touchée mais jamais chargée à l'écran n'a simplement rien à
  retirer visuellement, mais les compteurs (`comptes`, `compteFiltre`) se mettent à jour sur le
  nombre RÉEL de lignes touchées (`touched`), jamais sur ce qui était visible.
- **`restaures` change de forme** (`restaurer-bulk`, `restaurer-bulk-filtre`) :
  `LigneRestauree[]` (`{ publicId, statutOrigine }`), plus une simple `string[]`. Nécessaire
  seulement pour `restaurer-bulk-filtre` — contrairement à `bulk-filtre` (un seul verbe pour tout
  l'appel, `retirerDesListe` s'en sort sans donnée supplémentaire), la restauration renvoie
  chaque ligne à son statut D'ORIGINE, qui varie ligne à ligne et que le client ne peut pas
  deviner pour une ligne jamais chargée.

**Amendement du 05/08/2026 — la file admin filtre en base, pas côté client (neuvième
amendement conscient de la liste fermée).** `GET /api/v1/admin/deals` chargeait tous
statuts confondus (`LIMIT 1000` global, tri `auto_draft` d'abord puis `score desc,
public_id desc`) ; chaque onglet du back-office filtrait et triait ensuite ce même tableau
côté client. Fait générateur : une soumission `en_attente` restait invisible dans le
back-office bien qu'existant en base avec le bon statut — la table comptait 1592 lignes,
938 à égalité de score `0` parmi les non-`auto_draft`, départagées par `public_id`
(arbitraire, pas `created_at`) ; la soumission tombait hors des 354 places restantes après
les 646 `auto_draft`, silencieusement (docs/INCIDENTS.md, 04/08/2026).

- `statut` devient un paramètre **requis** de `GET /api/v1/admin/deals` : un onglet
  interroge son statut, jamais l'ensemble. Pagination par curseur (`_lib/adminDealsCursor.ts`),
  même mécanique que le feed public — jamais d'offset, jamais de `LIMIT` global.
- Tri par statut (`triPourStatut`, `_lib/deals.ts`) : `en_attente` trie par `created_at`
  croissant (plus ancien d'abord — une file d'attente se traite dans l'ordre d'arrivée, pas
  par classement) ; les autres onglets conservent le tri par remise décroissante déjà en
  vigueur.
- `GET /api/v1/admin/deals/compte` — nouvel endpoint, un `count(*)` par statut, toujours les
  cinq clés présentes. Les compteurs par onglet du back-office en dépendent désormais,
  jamais de la longueur d'une liste paginée : un onglet qui n'a chargé que sa première page
  ne peut pas se compter lui-même sans mentir sur ce qu'il n'a pas encore chargé — c'est le
  même motif de repli silencieux que `docs/INCIDENTS.md` consigne déjà trois fois ailleurs.
- L'avertissement de troncature (« la limite serveur a tronqué le résultat ») est retiré du
  back-office : sans `LIMIT` global, il n'a plus d'objet, et un avertissement permanent
  qu'on apprend à ignorer est pire qu'aucun avertissement.
- **`enseigne`/`categorie`/`remiseMin`/`remiseMax`/`prixMin`/`prixMax`/`dateMin`/`dateMax`**
  (lot filtres/tri du 12/08/2026) puis **`source`** (15/08/2026, `_lib/adminDealsFilters.ts`,
  `lib/sourcesAdmin.ts`) s'ajoutent en paramètres de requête optionnels, combinables en AND
  avec `statut` — même endpoint, pas un nouvel amendement numéroté : ce sont des filtres sur
  un endpoint déjà dans la liste fermée, pas un nouvel endpoint ni un nouveau champ exposé
  sur `Deal`. `source` est **dérivé du domaine de `deals.lien`**, jamais une colonne
  supplémentaire : carrefour.ma et bringo.ma partagent délibérément la même `enseigne`
  ("Carrefour", pour que le dédoublonnage titre+enseigne+prix s'applique entre les deux
  sources — docs/SPIKE-SOURCES.md §12) et restaient jusqu'ici indistinguables dans la file
  admin. `GET /api/v1/admin/deals/compte-filtre` et `POST /api/v1/admin/deals/bulk-filtre`
  (mêmes filtres, `conditionsFiltresAdmin()` — source unique) manquaient déjà de cette
  liste fermée avant ce jour ; non corrigé ici, hors périmètre de ce lot.

**Révision du 02/08/2026 (même journée) — le canal passe DANS le chemin.** La première
rédaction exposait `/diffuser` sans canal, Telegram étant le seul. Dès le second canal
(Discord), un chemin implicite serait devenu un piège : rien n'y aurait dit *où* part le
message, et le jour d'un troisième canal il aurait fallu inventer un paramètre. Les deux
canaux se diffusent et s'annulent **indépendamment** — l'anti-double-envoi est lui-même par
canal (`unique (deal_id, canal)`), donc diffuser sur Discord un deal déjà sur Telegram est
légitime, et l'inverse aussi.

- **Gardes, ordre des opérations et traduction des échecs sont écrits UNE fois**
  (`_lib/diffusion.ts`), les routes ne font que nommer leur canal. Deux copies de cette
  logique auraient dérivé — même raison que la validation zod partagée du pipeline.
- **Discord passe par un webhook entrant appelé avec `?wait=true`.** Ce n'est pas un
  réglage de confort : sans lui Discord répond `204` sans corps, on n'apprend jamais
  l'identifiant du message, et la diffusion devient **indélébile** — exactement le défaut
  corrigé côté Telegram le même jour.
- **`diffusions.telegram_message_id` devient `external_message_id` (`text`)**, migration
  0012. En `text` parce que les identifiants Discord sont des snowflakes 64 bits transportés
  en chaîne : les faire transiter par un `Number` JavaScript les arrondirait, et un
  identifiant arrondi ne supprime pas le bon message.

**Amendement du 02/08/2026 — diffusion communautaire (huitième amendement conscient, lot Telegram)** :
`POST /api/v1/admin/deals/:publicId/diffuser` publie un deal **déjà `publie`** sur le canal Telegram
(architecture arrêtée dans `docs/IDEES.md` § « Diffusion communautaire »). Endpoint admin, **un deal
à la fois** : aucune diffusion groupée n'est exposée, volontairement — en v1 la sélection est un
geste de curation, pas un traitement de lot.

- **Ordre non négociable** : gardes → envoi Telegram → écriture en base. La ligne `diffusions`
  (migration 0011) n'est écrite **qu'après un envoi réellement abouti**. L'inverse laisserait la
  trace d'une diffusion qui n'a pas eu lieu, et l'anti-double-envoi bloquerait alors le vrai envoi.
- **Un échec Telegram remonte tel quel** (statut HTTP + description de l'API), jamais un succès de
  politesse — même doctrine que le fallback silencieux, `docs/INCIDENTS.md`.
- **Anti-double-publication en base**, pas seulement en applicatif : `unique (deal_id, canal)`. La
  vérification applicative donne un message clair ; c'est la contrainte qui tient sous double clic.
- **`utm_source=telegram&utm_medium=social&utm_campaign=diffusion`** sur le lien diffusé —
  convention fixée dans `IDEES.md`, appliquée à l'identique. Constat au passage : aucun autre lien
  du site ne porte d'UTM (le bouton Partager partage l'URL nue), il n'y avait donc aucune
  convention de code à reprendre.
- **Nouveau code d'erreur `CONFLICT` (409)** dans la liste du §4 ci-dessus : l'état de la ressource
  interdit l'action alors que la requête est valide et les droits bons — diffuser un deal non
  publié, ou déjà diffusé. `VALIDATION_ERROR` aurait envoyé le curateur corriger un corps de
  requête sans faute ; `FORBIDDEN` lui aurait fait douter de ses droits.
- ~~**Destination pilotée par présence de variable** : `TELEGRAM_CHAT_ID_TEST`, si elle est
  définie, prime sur `TELEGRAM_CHAT_ID`~~ — **remplacé le 08/08/2026, dix-septième amendement
  conscient, voir ci-dessous** : cette préférence ambiante s'est révélée être exactement le risque
  qu'elle prétendait éviter (une variable de test absente faisait silencieusement retomber
  l'envoi sur le canal public). La réponse renvoie toujours `canalTest` pour que l'admin sache
  lequel des deux vient de se produire.

**Amendement du 08/08/2026 — mode de diffusion explicite, fail-closed (dix-septième amendement
conscient).** Fait générateur : `TELEGRAM_CHAT_ID_TEST`/`DISCORD_WEBHOOK_URL_TEST` absentes en
production au 02/08/2026 (vérifié) — chaque diffusion serait alors partie en silence vers le canal
PUBLIC, sans qu'aucun message ni aucune erreur ne le signale. Même motif que Turnstile, le backup et
les commentaires (`docs/INCIDENTS.md`) : **un repli qui ne se voit pas n'est pas un filet, c'est un
risque déguisé en garde-fou.**

- **`POST .../diffuser/telegram` et `.../discord` exigent désormais `?mode=production|test`** — ni
  optionnel, ni de valeur par défaut. Sans ce paramètre, ou avec une valeur hors de cette liste :
  `VALIDATION_ERROR` (400), aucun envoi.
- **`mode=test` avec la variable `_TEST` correspondante absente : refus explicite** —
  `VALIDATION_ERROR` (400), message nommant la variable manquante, **aucun envoi, sur aucun
  canal**. Il n'existe plus de chemin qui fasse atterrir un envoi « test » sur le canal de
  production.
- **`mode=production` lit TOUJOURS `TELEGRAM_CHAT_ID`/`DISCORD_WEBHOOK_URL` directement**, que la
  variable `_TEST` existe ou non — plus aucune lecture ambiante de `_TEST` sur ce chemin.
- **`DELETE` (annulation) reste volontairement inchangé dans son contrat** (aucun paramètre) et cible
  toujours la destination de **production** — annuler un envoi de test n'est pas exposé par cette
  route admin, comme lors de la session de vérification manuelle du 02/08/2026 (annulé par appel
  direct de l'API). Limite assumée, pas un oubli : documentée ici pour ne pas être redécouverte.
- **Aucun nouveau code d'erreur** : `VALIDATION_ERROR` (400) couvre les deux refus ci-dessus — la
  requête elle-même est en cause (mode manquant/invalide, ou mode demandé non configuré), jamais
  l'état de la ressource (`CONFLICT` reste réservé à « deal non publié »/« déjà diffusé »).

**Notes** :
- **Amendement du 27/07/2026 — compte de résultats (septième amendement conscient, lot 7)** :
  `GET /api/v1/deals/compte` renvoie, pour un jeu de filtres donné, le nombre de deals que
  `GET /api/v1/deals` renverra. Endpoint séparé et non champ ajouté à la liste : la feuille de
  filtres annonce ce nombre pendant que l'utilisateur compose sa sélection, avant de l'appliquer —
  le coller à la liste imposerait de télécharger une page de deals à chaque option cochée.
  - **Révision du 28/07/2026** : l'endpoint s'appelait `/deals/facettes` et renvoyait AUSSI un
    compte par catégorie et par ville, qui alimentait des compteurs affichés option par option puis
    le grisé des options sans deal. Les deux ont été retirés — les compteurs faute de valeur
    d'usage constatée, le grisé parce que sept catégories pâles sur douze, sans un chiffre pour les
    expliquer, donnaient une colonne à moitié morte. L'agrégation croisée est partie avec eux : il
    ne restait qu'un `count(*)`, et une agrégation par dimension entretenue pour un seul scalaire
    n'aurait plus rien justifié. C'est l'ÉTAT VIDE du feed qui prend le relais — il nomme ce qui a
    été filtré et propose d'élargir, ce qu'une option grisée ne disait pas.
  - **Prédicats partagés, jamais réécrits** (`apps/web/src/app/api/v1/_lib/dealsFilters.ts`) : les
    deux endpoints construisent leur `WHERE` avec les mêmes fonctions. C'est la seule garantie
    tenable que « le total annonce ce que le filtre renverra » — un second `WHERE` écrit à côté
    dériverait un jour, et cette dérive ne lève aucune erreur.
  - **`ville` change de sens** : filtrer sur une ville renvoie les deals de cette ville **plus** les
    deals `National` **plus** les deals disponibles en ligne. Motif : un deal en ligne est achetable
    depuis n'importe quelle ville ; l'égalité stricte d'avant retirait de la vue des offres
    réellement disponibles, sans le dire. Corollaire : quand `type=en_ligne`, `ville` est ignorée
    (normalisée à l'entrée) — l'interface désactive le sélecteur avec sa raison plutôt que de le
    laisser sans effet.
  - **`type` se lit en DISPONIBILITÉ, pas en égalité** : `physique` → `{physique, les_deux}`,
    `en_ligne` → `{en_ligne, les_deux}`. Un deal `les_deux` appartient aux deux ensembles ; l'égalité
    stricte le faisait disparaître des deux filtres à la fois. Aucune ligne `les_deux` en base à ce
    jour : comportement observable inchangé, mais il cesse d'être faux quand le pipeline en produira.
  - **`q` devient un filtre SERVEUR** (titre + enseigne, `ilike`, jokers échappés). Avant ce lot la
    recherche ne filtrait que les deals déjà téléchargés côté client : au-delà de la première page,
    elle ne trouvait rien, et aucun compteur n'aurait pu s'accorder avec elle.
  - **Le curseur embarque la signature des filtres** qui l'ont produit, et le serveur refuse
    (`VALIDATION_ERROR`) tout curseur présenté avec d'autres filtres. Un curseur est une position
    dans un jeu de résultats donné : rejoué ailleurs, il saute ou duplique des lignes en silence.
    La règle « tout changement de filtre réinitialise la pagination » ne dépend plus de la
    discipline du client. Les curseurs émis avant ce lot ne sont plus décodables — sans effet en
    pratique, ils ne vivent que le temps d'une session de défilement.
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
- Amendement du 20/07/2026 — cron quotidien (Phase 7B, quatrième amendement conscient) :
  `POST /api/revalidate` (`apps/web/src/app/api/revalidate/route.ts`), **volontairement hors
  `/api/v1`** — même statut d'exception que le pipeline ci-dessus : infrastructure (déclenchée
  uniquement par `.github/workflows/pipeline-quotidien.yml` après la chaîne scraping/insertion),
  jamais consommée par le client web/mobile, jamais soumise à la garantie de stabilité de la
  liste fermée. Protégée par un jeton comparé en temps constant (hash SHA-256 des deux valeurs
  puis `timingSafeEqual`, jamais un `===`), lu depuis `REVALIDATE_TOKEN` (variable d'environnement
  Vercel **et** secret GitHub — jamais commitée, jamais journalisée). Revalide le feed, chaque
  page enseigne et le sitemap. Le pipeline gagne aussi un script `expirer-auto-draft`
  (`apps/pipeline/expiration.mjs`) : tout deal `auto_draft` de plus de 14 jours passe `expire`
  (CONTRAT-V1 §1, jamais de suppression) — première étape de chaque run quotidien, avant le
  scraping.
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
  - **Extension upload manuel** (même amendement, voir §3) : `POST /api/v1/admin/deals/:publicId/image`
    couvre le cas où la source bloque `image-depuis-lien` (Jumia et similaires — 403 constaté
    aux IP datacenter, y compris depuis Vercel en prod). Multipart, fichier identifié par ses
    premiers octets (jamais le Content-Type déclaré), 5 Mo max, seul le WebP ré-encodé par sharp
    est stocké — jamais le fichier original reçu. Traitement + stockage factorisés dans
    `_lib/dealImage.ts`, partagés avec `image-depuis-lien`.
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
  CI rouge. **La CI ne modifie jamais la prod** — cette phrase-là ne bouge pas.

**Amendement du 2026-07-27 — qui exécute les migrations en production.**

La rédaction précédente disait « geste humain via le runner ». En pratique
Kamel n'exécutait rien lui-même : la migration attendait, la CI restait
rouge, et le décalage entre le repo et la prod durait. Un garde-fou qu'on
contourne par lassitude n'en est pas un.

- **L'exécuteur est Claude Code**, depuis la machine locale, via
  `pnpm --filter @fidwastafid/db migrate` sur le **port 5432** (Session
  pooler — voir la règle des deux ports dans `docs/RUNBOOK-securite.md` ;
  6543 est réservé à l'app serverless).
- **Sur confirmation explicite et par opération.** Une confirmation vaut
  pour la migration nommée, et pour elle seule : elle ne se reporte ni sur
  la suivante, ni sur un rejeu. Aucune migration n'est appliquée en prod
  « au passage », dans le flux d'un autre lot.
- **La confirmation vaut geste.** C'est le point de l'amendement : la
  décision reste humaine, l'exécution ne l'est plus. Ce qui est protégé,
  c'est l'intention, pas le clavier.
- **Le connecteur Supabase reste en lecture seule.** Il sert à vérifier
  après coup, par un chemin différent de celui qui a écrit — une
  vérification qui emprunte la même connexion que l'écriture ne vérifie
  rien. Il n'applique jamais de migration, même s'il en a la capacité.
- Ordre imposé : **migration d'abord, fusion ensuite**, quand la migration
  est rétrocompatible (ajout de colonne avec défaut, que le code courant
  ignore). L'inverse déploie du code qui lit une colonne inexistante.

**Amendement du 15/08/2026 — le prix d'appliquer avant de fusionner, et l'ordre par
défaut.** Fait générateur : les migrations 0021 (diffusion en masse) et 0022
(`memoire_curation`, RLS) ont toutes deux été appliquées en production pendant que leur
PR respective était encore ouverte — nécessaire pour que la préversion Vercel de cette
PR fonctionne (elle pointe sur la **même** base de production, faute d'environnement de
recette, `docs/IDEES.md` § « Staging Supabase »). Effet observé : `migrations-check`
est passé rouge sur une **autre** PR ouverte, non liée, partie de `main` avant la
fusion — la base de production porte alors une entrée `schema_migrations` qu'aucune
branche partie de `main` ne peut encore avoir dans `packages/db/migrations/`. Corrigé en
rebasant cette autre branche sur `main` une fois la première PR fusionnée.

- **Ce n'est pas un bug de `migrations-check` : c'est exactement ce qu'il est censé
  détecter** — un écart entre le repo et la prod. Le geste (appliquer avant de fusionner)
  crée cet écart consciemment, pour une fenêtre de temps bornée à « jusqu'à la fusion de
  cette PR ».
- **Ordre par défaut, dorénavant explicite : fusionner la PR, PUIS appliquer la
  migration.** Aucun autre écart possible entre branches tant qu'aucune autre PR n'est
  ouverte en parallèle sur `packages/db/migrations/`.
- **Exception consciente, par opération** (même discipline que la confirmation
  ci-dessus) : appliquer avant fusion reste légitime quand la PR a besoin d'une
  préversion vérifiable de bout en bout AVANT la revue de Kamel — c'est-à-dire dans ce
  dépôt, systématiquement, tant qu'aucun environnement de recette séparé n'existe. Dans
  ce cas, un `migrations-check` rouge sur une PR SŒUR non liée, ouverte au même moment,
  est un effet de bord attendu, pas une régression à corriger autrement qu'en fusionnant
  puis en rebasant.

## 8 — Design tokens (déjà tranchés, non-négociables)

**Amendement du 2026-07-24 — abandon de la palette rouge/or/crème pour la direction « Tadelakt ».**
Motif : la triade rouge + or saturés lisait « marketplace bas de gamme », l'or à plat n'existe pas en
digital, et le rouge de marque entrait en collision avec le rouge « promotion » — rendant impossible
toute signalisation d'urgence réelle. La couleur passe désormais au service de la photo produit (feed
scrapé, non maîtrisé) : l'UI est un cadre plâtre + encre à ~90 %, jamais un concurrent chromatique.

### Direction Tadelakt — trois principes

1. **Faible charge chromatique** — la page est plâtre + encre à ~90 %. La couleur vient des photos
   produits, que nous ne contrôlons pas. L'UI est un cadre, pas un concurrent.
2. **Trois rôles chromatiques, un métier chacun, aucun recouvrement** — `accent` (argan) = interactif
   et marque ; `hot` (braise) = température chaude et rien d'autre ; `cold` (glacé) = température
   froide et rien d'autre.
3. **L'affordance vient du contraste, du contour et de l'état**, pas de la saturation. Le prix n'est
   plus coloré : sa taille le hiérarchise.

### Palette (source de vérité — noms sémantiques, jamais des noms de couleur)

| Token | Hex | Usage |
|---|---|---|
| `surface-base` | `#F4F1EC` | fond de page (plâtre) |
| `surface` | `#FFFFFF` | cartes, panneaux, champs |
| `surface-subtle` | `#FAF8F4` | survol de surface, zones inertes |
| `border` | `#E3DED4` | filets par défaut |
| `border-strong` | `#D2CABB` | contour de tout élément **cliquable** |
| `ink` | `#1A1815` | texte principal, fond du monogramme sur variante encre |
| `ink-muted` | `#5C554B` | texte secondaire, icônes de méta |
| `ink-subtle` | `#736B61` | aides, horodatages, placeholders |
| `accent` | `#2F6B57` | interactif, marque, focus (argan) |
| `accent-hi` | `#24564A` | survol du bouton primaire |
| `accent-soft` | `#EAF1ED` | champ du hero, badge de remise, filtre actif |
| `accent-line` | `#B6CFC4` | contour des éléments accent doux |
| `safran` | `#B07C2A` | **ornement de marque uniquement** — voir règle 4 |
| `safran-line` | `#E0C793` | `w` du monogramme, filet de la baseline |
| `hot` | `#AD4527` | score chaud (≥ seuil) — **rien d'autre** |
| `hot-soft` | `#F9E9E2` | fond du vote haut et du badge « Tendance » |
| `hot-line` | `#E6C5B6` | contour du vote chaud et du badge |
| `cold` | `#4C6674` | froideur d'un deal : score négatif **ou** expiré |
| `cold-soft` | `#EAF0F3` | fond du vote bas et des états expirés |
| `cold-line` | `#C2D2DA` | contour du vote froid |
| `warn` | `#7C6015` | file d'attente, alertes de prix |
| `warn-soft` | `#F5EEDD` | fond associé |

**Ajustement du 26/07/2026 (lot 4)** — référence chromatique :
`docs/maquettes/tadelakt-couleur-subtile.html`, qui remplace `tadelakt-site-complet.html` sur les
couleurs (celle-ci reste la référence de structure et des écrans 02-08). Fait générateur : après revue
visuelle de la préversion, le site paraissait **terne**. L'accent précédent (`#2C5545`) était trop
sombre et trop désaturé pour se lire comme une couleur, et les boutons primaires en `ink` avaient
supprimé le dernier porteur d'identité. `#2F6B57` conserve la même luminance utile (6,25:1 sur blanc)
avec plus de chroma : présence gagnée, lisibilité inchangée. Le bouton primaire passe en `accent`.

Deux valeurs divergent **volontairement** de la maquette HTML validée, pour passer le contraste AA :
`ink-subtle` vaut `#736B61` (et non `#8B8378` : 3,74:1 → 5,24:1 sur blanc) et `cold` vaut `#4C6674`
(et non `#54707F` : 4,49:1 → 5,19:1 sur `cold-soft`). Tous les couples texte/fond de la palette sont
mesurés ≥ 4,5:1.

### Non-négociables (inchangés par cet amendement)

- **Marque** (amendement du 26/07/2026, lot 5). L'identité de Fidwastafid repose sur un logotype latin
  **FIDWASTAFID** — `FID` et `STAFID` en `accent`, `WA` en `safran` — accompagné de la baseline
  « Les bons plans du Maroc » en `ink-2`, flanquée de deux filets, l'un `accent`, l'autre `safran`.
  Sa forme carrée est le monogramme **FwS**, le `w` minuscule reprenant la conjonction *و* du nom.
  Les fichiers de référence vivent dans `apps/web/public/brand/` : ce sont des tracés vectoriels,
  jamais du texte composé, et ils ne doivent pas être redessinés.

  La calligraphie arabe `فيد و ستافيد` est **conservée en signature secondaire** au pied de page.
  Elle reste non négociable à ce titre. Le médaillon circulaire à anneau safran est abandonné, ainsi
  que les pistes khatim et flèches d'échange.
- **Typographie Scheherazade New** pour tout rendu arabe.
- **Libellés de vote `ربح`** (vote chaud) **/ `خسارة`** (vote froid).
- **CTA en darija.**

### Règles d'application chromatique (gravées)

1. **Une seule action pleine (`variant="primary"`) par écran.**
2. **Le gris pâle est interdit sur tout élément cliquable** — un cliquable porte toujours un contour
   `border-strong` et une encre lisible, jamais un gris d'inertie.
3. **`hot` en aplat ou en badge est réservé au score chaud (≥ seuil). La variante `danger` des
   primitives peut employer la teinte `hot` en contour et en texte uniquement, jamais en aplat au
   repos. `cold` couvre la froideur d'un deal au sens large : score négatif et état expiré.** Toute
   autre utilisation est un bug.
4. **`safran` est un ornement de marque** : logotype (le `WA`, le `w` du monogramme, le filet de la
   baseline) et motif du hero. Il n'apparaît jamais sur un bouton,
   un badge, un état ou un texte courant. Toute apparition de `safran` dans un composant d'interface
   est un bug — c'est par cette accumulation que la charte rouge/or abandonnée se reconstituerait.
   Corollaire technique : à 3,6:1 sur blanc, `safran` ne passe pas l'AA en texte courant ; il est
   réservé aux tracés et au grand corps.
5. **Les maquettes sont des références VISUELLES exclusivement.** Leur contenu textuel et chiffré est
   du remplissage. Aucun texte, libellé ou nombre ne doit jamais en être repris. En cas de divergence
   de contenu, le code existant prime sur la maquette.

   *Fait générateur (26/07/2026)* : le lot 4 avait remplacé le titre et les trois étapes du hero par
   la baseline de la maquette, et affiché « 184 deals actifs / 27 enseignes / 4 210 membres » — des
   chiffres d'audience **inventés**, écrits en dur, sans aucune source. Une refonte annoncée comme
   cosmétique avait ainsi modifié le discours du produit. Le contenu a été restauré à l'identique.

6. **Une primitive de charte se conserve SANS APPELANT, mais doit porter un test la rattachant aux
   tokens courants. Sa suppression est un amendement de ce contrat, jamais un nettoyage.**

   Ce paragraphe définit une charte, pas un inventaire d'usages : qu'aucun écran n'emploie une
   forme ce mois-ci ne dit rien sur sa justesse. La retirer ferait redécouvrir la question au
   prochain qui en a besoin, et rouvrirait une décision déjà tranchée.

   Le prix de cette conservation doit être payé, sans quoi la protection se retourne : **sans
   appelant, plus rien ne fait échouer une primitive.** Elle continue de compiler en référençant des
   tokens supprimés, et rend du vide le jour où on la ressort — une dérive d'autant plus coûteuse
   qu'elle ne se découvre qu'à la remise en service. Toute primitive conservée porte donc un test de
   rendu (`apps/web/tests/primitives.ts`) qui, pour chacun de ses états, vérifie **dans les deux
   sens** : que chaque token employé existe encore dans le `@theme` de `globals.css`, et que la
   primitive le référence toujours réellement.

   *Fait générateur (28/07/2026)* : le lot 7 a retiré le dernier appelant de `Chip` (les puces de
   filtre du feed, remplacées par la colonne latérale et la feuille mobile). La primitive est
   conservée et gardée ; `Badge`, `Input`, `Textarea` et `Button` ont encore des appelants et sont
   couverts par le même test, à titre préventif.

Référence directe pour la config Tailwind (`@theme`, `apps/web/src/app/globals.css`) et les primitives
UI (`apps/web/src/components`). La refonte est portée en trois lots : lot 1 = ce contrat + tokens +
primitives ; lots 2 et 3 = migration de `DealCard`, des pages et du chrome.

**Décision du 05/08/2026 — `rejete`/`auto_draft` n'étendent PAS `Badge`.** Inventaire des badges de
statut de deal rendus à la main (`/compte`, fiche deal, `UrgenceCountdown`) : les cinq statuts
(`publie`, `en_attente`, `rejete`, `expire`, `auto_draft`) tiennent tous dans les cinq variantes
existantes — `accent`/`warn`/`cold` pour les trois qui ont un rôle chromatique dédié (règle 3),
`outline` pour les deux qui n'en ont pas. `hot` est écarté (réservé au score chaud, règle 3) ; `safran`
n'a jamais été candidat (ornemental, règle 4). **Ce n'est pas un amendement** : aucun token nouveau,
aucune variante nouvelle — `outline` couvrait déjà ce cas (le test de primitives, §8 règle 6, l'illustre
depuis sa création avec le libellé « Brouillon »), il manquait seulement un appelant réel. Les trois
rendus manuels ont été rapatriés sur la primitive.

## 9 — Sécurité by design

**Amendement du 22/07/2026 — surface plateforme (sixième amendement conscient de la
liste fermée)** : fait générateur, incident advisor Supabase `rls_disabled_in_public`
— les 9 tables du schéma public étaient exposées sans RLS, grants par défaut complets
pour `anon`/`authenticated`, via l'API Data (PostgREST), un canal que l'app n'a jamais
utilisé (accès exclusif par `DATABASE_URL`, rôle propriétaire — §7) mais qui restait
ouvert par défaut. Exposition contenue en 12 min (schéma public retiré de l'API Data,
vérifié par un `curl` renvoyant 404) ; correctif durable migré en prod le jour même
(`0008_rls_public_tables.sql`, RLS sans policy sur les 9 tables). Leçon : la surface de
sécurité auditée jusqu'ici (revues de code, CI) était limitée au code — la dérive
vivait dans la configuration plateforme, hors de ce périmètre.

Principes gravés par cet amendement :

- **Surface de sécurité = code ET configuration des plateformes** (Supabase, Vercel,
  Cloudflare, GitHub) — un audit de code seul ne couvre pas les réglages par défaut
  d'une plateforme managée.
- **Moindre exposition** : tout canal d'accès non utilisé par l'architecture est fermé
  par défaut, pas seulement non documenté. Fait générateur de cette règle : l'API Data
  Supabase, ouverte par défaut sur un projet qui n'en a jamais eu l'usage.
- **Les advisors de plateforme font partie de la définition de « terminé »** d'un lot
  touchant la base ou l'infra : advisor sécurité vérifié avant clôture, pas seulement
  build/lint/tests.
- **État nominal advisor**, référence pour toute revue future : **9 `INFO`
  `rls_enabled_no_policy`** (RLS sans policy = deny-all voulu pour PostgREST, l'app
  accède en direct par le rôle propriétaire) + **1 `WARN`
  `auth_leaked_password_protection`** (assumé, décision produit — voir `IDEES.md`).
  Toute **nouvelle** entrée advisor au-delà de cet état est une anomalie à instruire,
  pas un bruit de fond à ignorer.

**Complément du 23/07/2026 — régression CI du correctif 0008** : le RLS sans policy a
aussi filtré silencieusement à 0 ligne les lectures du rôle CI d'audit
`ci_migrations_check` sur `schema_migrations` (non-propriétaire, non-BYPASSRLS) — CI
rouge sur toute branche, docs comprises (runs #191-#204), jusqu'au correctif
`0009_ci_migrations_check_bypassrls.sql`. Principe gravé par cette régression : **rôle
d'audit = BYPASSRLS explicite, jamais un retour silencieux à zéro lignes** ; et avant
d'activer RLS sur une table, lister ses lecteurs — les 3 consommateurs connus de la
base sont l'app (propriétaire), le pipeline (propriétaire) et la CI d'audit
(`ci_migrations_check`, BYPASSRLS). Détail et règle rejouable :
`docs/RUNBOOK-securite.md`.

Routine associée : revue sécurité mensuelle, checklist rejouable — voir
`docs/RUNBOOK-securite.md`.

---

## Ce que ce contrat NE couvre PAS (volontairement)

- Mécanique de maintenance du compteur `score` (recalcul sync/async) — détail d'implémentation Phase 2/3.
- Refresh de token — détail d'implémentation Phase 2.
- Redirection best-effort des anciens liens `#deal-{id}` déjà partagés — jugée inutile, le site n'est
  pas encore réellement utilisé en prod.
- Table dédiée ville/catégorie avec contenu enrichi — reportée, activable sans casse si le besoin émerge.
