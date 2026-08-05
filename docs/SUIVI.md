# SUIVI — état à date et file de travail

*Dernière mise à jour : 2026-08-05, sur `main` à `f453c07`.*

Ce document est le **point d'entrée pour reprendre le travail sans contexte préalable**. Il dit
ce qui tourne, ce qui reste ouvert, et par quoi continuer. Il ne remplace aucun autre document :
il y renvoie.

> **Ce document se périme à chaque fusion.** Sa version précédente datait de `1428ba9` et
> affirmait encore, la veille, que Telegram n'était pas éprouvé et que Discord restait
> entier — alors que deux PR l'avaient livré. Un état à date qui retarde fait arbitrer sur un
> monde qui n'existe plus ; **la relecture de ce fichier fait partie de la fusion**, pas du
> ménage d'après.
>
> **La règle ne s'était pas appliquée à elle-même.** La PR #75 a livré la priorité 2 de ce
> document *sans le mettre à jour* : trois heures plus tard, il annonçait encore comme
> chantier à trancher quelque chose qui tournait déjà en production. Une règle qui ne vit que
> dans le fichier qu'elle protège n'est lue qu'après coup — elle est donc désormais **portée
> par le gabarit de PR** (`.github/pull_request_template.md`), c'est-à-dire posée sous les
> yeux au moment où le geste se fait, pas dans le document qu'on a oublié d'ouvrir.

---

## 0 — Où lire quoi

| Document | Ce qu'on y trouve |
|---|---|
| `docs/CONTRAT-V1.md` | **La référence.** Modèle de domaine, liste fermée des endpoints, design tokens, sécurité. Toute décision se vérifie contre lui. Les écarts y sont consignés comme « amendements conscients », numérotés. |
| `docs/fidwastafid-plan-v2.md` | Le plan par phases dont ce dépôt est l'exécution. |
| `docs/IDEES.md` | Le parking. Tout ce qui a été **décidé de ne pas faire maintenant**, avec le motif et le déclencheur de réexamen. À lire avant de proposer une idée : elle y est peut-être déjà, refusée pour une raison. |
| `docs/INCIDENTS.md` | Les pannes réelles et leur diagnostic. Plusieurs règles du contrat viennent de là. |
| `docs/AUDIT-V1.md` | L'état de la v1 dont la v2 est la reprise. |
| `docs/RUNBOOK-*.md`, `docs/runbooks/` | Procédures d'exploitation : données, restauration, sécurité, e-mails. |
| `docs/SPIKE-SOURCES.md` | Étude des sources scrapables. |

**Convention de travail** : une branche par lot, PR relue, jamais de push direct sur `main`.
La liste de contrôle avant fusion vit dans `.github/pull_request_template.md` (créé le
03/08/2026) — mise à jour de ce document, quatre checks bloquants, amendements du contrat,
migrations, chiffres sourcés, absence de repli silencieux, et **ce que la PR n'a pas vérifié**.

**Protection de branche — relevé le 2026-08-03 par l'API GitHub, pas de mémoire.** `main` exige
une PR et **quatre** checks bloquants : `quality`, `docker`, `openapi-check`, **`Vercel`**.
`enforce_admins` est actif. `integration` et `migrations-check` sont **consultatifs** — ils sont
rouges sur toute PR Dependabot faute de secrets, les rendre bloquants paralyserait le dépôt
(`docs/INCIDENTS.md`, 27/07/2026). *La version précédente de ce document annonçait « cinq jobs
bloquants » en y comptant `integration` et `migrations-check` : c'était faux, et c'est
exactement le genre d'erreur qui fait croire qu'un garde-fou existe.* Un échec réel sur un job
consultatif reste un échec réel.

---

## 1 — Ce qui tourne en production

**https://fidwastafid.com** — déployé depuis `main` par Vercel à chaque fusion. Dernier
déploiement de production : `f453c07`, check `Vercel` **`success`**, 2026-08-05 06:51 UTC
(relevé par l'API GitHub, pas de mémoire). Le run CI du même SHA est vert.

### Chiffres réels au 2026-08-05

Relevés en base par le connecteur Supabase en lecture seule, pas estimés :

| Mesure | Valeur | (au 2026-08-03) |
|---|---|---|
| Deals `publie` | **113** | 113 |
| Deals toutes lignes confondues | **1 592** | 1 553 |
| Deals `auto_draft` (file de curation) | **646** | 645 |
| Deals `en_attente` (soumissions humaines) | **2** | 0 |
| Deals `rejete` | **417** | — |
| Deals `expire` | **414** | — |
| Enseignes curées | **9** | 9 |
| Villes distinctes portant un deal publié | **2** | 2 |
| Comptes membres (`users`) | **4** | 4 |
| Lignes `diffusions` **vivantes** | **0** | 0 |
| Diffusions **historiques** (`pg_stat_user_tables`) | **3 insérées, 3 supprimées** | — |

Les deux `en_attente` sont `gygr5z7qyn` et `c7hwa6eute` (soumission `marwa.com`, objet du
diagnostic du 04/08 — voir `docs/INCIDENTS.md` et le lot « File admin » ci-dessous) :
vérifiées visibles dans l'onglet « En attente » du back-office après déploiement de #83, et
le compte affiché par `GET /api/v1/admin/deals/compte` (**2**) coïncide avec ce `count(*)`
direct.

Ces nombres ne sont plus seulement un relevé : depuis #75, **`/concept` les relit en base à
chaque affichage** au lieu d'afficher les « +50 enseignes / +20 villes » écrits en dur.
Vérifié le 2026-08-03 : plus aucun chiffre d'audience en dur ne subsiste dans
`apps/web/src` — les seules occurrences de `+50`/`+20` restantes sont dans le commentaire de
`concept/page.tsx` qui consigne le fait générateur.

**Migrations** : `packages/db/migrations/` va jusqu'à `0012_diffusions_canal_explicite.sql`,
appliquée en prod le 2026-08-02 19:45 UTC. Repo et prod sont alignés (vérifié dans
`public.schema_migrations`).

### Fonctionnel livré

- **Feed** (`/`) — SSR par requête, pagination par curseur (jamais d'offset), tri
  tendance/score/récent. Filtres : catégorie, ville, « où acheter », recherche, tous portés par
  l'URL (partage et retour arrière fonctionnels).
  - Desktop (≥ md) : colonne latérale collante à gauche portant marque, lien concept, tri,
    catégories, ville, où acheter, réinitialisation et CTA de soumission.
  - Mobile : bloc collant recherche + bouton « Filtrer » unique, ouvrant une feuille modale
    (`<dialog>`, focus piégé, Échap, appui hors panneau).
  - Règle métier notable : **filtrer sur une ville renvoie cette ville + les deals nationaux +
    les deals disponibles en ligne** — un deal en ligne est achetable de partout.
- **Page deal** (`/deal/[slug]-[public_id]`) — résolution sur le `public_id` seul, 301 si le slug
  diverge, données structurées, partage, votes, commentaires.
- **Pages enseigne** (`/enseigne/[slug]`), charte, confidentialité, contact. `/confidentialite`
  décrit désormais le réel mesuré (#79) : cookie de session et brouillon local, Vercel
  Analytics et Turnstile d'après leurs politiques publiques, hébergement Supabase+Vercel
  (Irlande, UE), droits étendus au RGPD pour les résidents UE. Un repère explicite (non
  rempli) y marque l'identité juridique manquante du responsable de traitement — voir
  « Ce qui reste ouvert ».
- **Consentement** — bandeau minimal (#80, #82) : Vercel Analytics ne se monte plus
  inconditionnellement, seulement après acceptation explicite (`Consentement.tsx`, lecture
  paresseuse du `localStorage` dès l'hydratation — aucune requête avant le choix, vérifié en
  conditions réelles sur `fidwastafid.com`). Titre « Cookies », texte neutre (aucun nom de
  prestataire), Accepter/Refuser de même poids visuel, choix révocable depuis le pied de
  page. Structure de données ouverte (`finalites: Record<string, boolean>`) : une
  personnalisation future s'ajoute sans réécriture, la version stockée permet de redemander
  le choix le jour venu.
- **Page concept** (`/concept`) — SSR par requête (`force-dynamic`). Ses deux statistiques
  chiffrées viennent de `GET /api/v1/deals/compte` et `GET /api/v1/enseignes`, handlers
  appelés directement comme le fait le feed. Un comptage en échec **masque sa tuile** et
  journalise ; il n'affiche jamais `0`. La tuile « Villes » a été retirée plutôt que branchée
  (une seule ville réelle porte des deals publiés — « 1 ville » n'est pas une statistique).
- **Soumission communautaire** (`/soumettre`) — authentifiée, Turnstile, photo optionnelle,
  toujours créée en `en_attente`.
- **Espace membre** (`/compte`) — identité, couleur d'avatar, compteurs, « mes deals » avec motif
  de rejet visible, export/suppression de compte (loi 09-08).
- **Back-office** (`/admin`) — pipeline de curation, édition complète d'un deal, actions
  groupées, récupération et upload d'image, motif de rejet obligatoire, **boutons de diffusion
  Telegram et Discord** (voir §3.2). Chaque onglet filtre désormais **en base** par son statut
  et pagine par curseur (#83) — plus de chargement de la table entière tranché côté client ;
  les compteurs d'onglet viennent d'un `count(*)` par statut (`GET /api/v1/admin/deals/compte`),
  jamais de la longueur d'une liste. Vérifié après déploiement : badges cohérents avec un
  `count(*)` direct, pagination de l'onglet `publie` (113 lignes, 4 pages) intégralement
  parcourue sans doublon.
- **Pipeline quotidien** (`apps/pipeline`) — **six sources** : bringo, inwi,
  universparadiscount, decathlon, **kiabi** et **bestmark** (ces deux dernières ajoutées le
  02/08 par leurs API publiques, #71). Insertion directe en base, expiration des `auto_draft`
  de plus de 14 jours, revalidation du cache déclenchée par GitHub Actions.
  - **Seuil de remise unique à 30 %** (`apps/pipeline/remise.mjs`, `SEUIL_REMISE_MIN_PCT`),
    appliqué dans `insert-deals.mjs` — le seul point de passage commun à toutes les sources.
    Avant le 02/08, aucun seuil n'existait : un produit à −2 % entrait comme un produit à
    −70 %. Le chiffre est délibérément **uniforme**, jamais par enseigne — motif et effet
    mesuré par source dans `docs/IDEES.md`.
- **API** (`/api/v1/*`) — liste fermée, documentée au CONTRAT-V1 §4, spec générée
  (`apps/web/public/openapi.json`) et vérifiée en CI par `openapi-check`.

### Derniers lots livrés

| Lot | PR | Fusionné | Contenu |
|---|---|---|---|
| File admin — filtre serveur | #83 | 05/08 | `GET /api/v1/admin/deals` : `statut` requis, filtre en base, pagination par curseur (neuvième amendement conscient, CONTRAT-V1 §4) — corrige le défaut diagnostiqué le 04/08 (`docs/INCIDENTS.md`) : une soumission `en_attente` invisible derrière un `LIMIT` global tranché côté client. `en_attente` trie `created_at` croissant ; nouvel endpoint `GET /api/v1/admin/deals/compte` pour les badges. Vérifié en production (ci-dessus). |
| Bandeau de consentement — texte neutre | #82 | 04/08 | Retire toute mention de prestataire et la catégorie « personnalisation » (inactive) de l'interface du bandeau — détail technique déplacé vers `/confidentialite`, seule censée être exhaustive. Enregistrement généralisé (`finalites: Record<string, boolean>`), version passée à 2. |
| Consentement — Analytics gaté | #80 | 04/08 | Vercel Analytics ne se charge qu'après consentement explicite (voir « Fonctionnel livré »). |
| `/confidentialite` — réalité mesurée | #79 | 04/08 | Page réécrite pour décrire le réel constaté, puis mise à jour pour l'état d'arrivée post-#80 (voir « Fonctionnel livré »). |
| Retrait mention CNDP non attestée | #78 | 04/08 | « Déclaré auprès de la CNDP » retiré sans remplacement de deux gabarits e-mail et deux maquettes — aucune preuve d'une déclaration réelle dans le dépôt. Consigné dans `docs/INCIDENTS.md` : ne se rétablit que sur numéro et date. |
| Chiffres de `/concept` | #75 | 03/08 | Les trois statistiques en dur remplacées par deux comptages réels (endpoints existants, **aucun amendement** de la liste fermée §4) et une constante assumée (« 100% Gratuit », qui est le modèle économique, pas une mesure). Aucun arrondi flatteur, aucun repli sur `0`. Au passage, `decrireErreur()` : `err.message` seul journalisait « indisponible — . » parce que `pg` remonte un `AggregateError` au message vide. |
| Diffusion Discord | #73 | 02/08 | Second canal, **et le canal passe DANS le chemin** (`/diffuser/discord`, `/diffuser/telegram`). Gardes et ordre des opérations factorisés dans `_lib/diffusion.ts`. Migration `0012` : `telegram_message_id` → `external_message_id` (`text`, les snowflakes Discord ne survivent pas à un `Number` JS). |
| Diffusion Telegram | #72 | 02/08 | Migration `0011` (`diffusions`, `unique (deal_id, canal)`), endpoints POST/DELETE, bouton dans l'admin, UTM sur le lien diffusé, code d'erreur `CONFLICT` (409). |
| Alerte backup assignée | #70 | 02/08 | L'issue d'échec de backup est **assignée** et porte le label `urgent` — une issue sans assigné ne notifie personne. |
| Kiabi et Bestmark | #71 | 02/08 | Deux sources de plus par API publique (Shopify `products.json`, GraphQL Magento), plus le seuil de remise ci-dessus. |
| Lot 7 — filtres du feed | #59 | 02/08 | Recherche serveur, `type` lu en disponibilité, curseur signé par ses filtres, `GET /api/v1/deals/compte`. |

---

## 2 — Ce qui reste ouvert

### Pull requests

Aucune PR de travail ouverte. Six PR Dependabot en attente de tri (#32, #58, #60, #61, #62, #63).
Un délai de refroidissement de 2 jours est configuré (`.github/dependabot.yml`), aligné sur la
politique pnpm `minimumReleaseAge` de 24 h — les mises à jour de **sécurité** en sont exemptées et
ne sont jamais retardées.

### Aucun cron de péremption du SUIVI n'existe *(diagnostiqué le 05/08/2026)*

**La question posée avait une prémisse fausse : il n'y a pas de cron à réparer, il n'y en a
jamais eu.** Recherche exhaustive : les trois workflows du dépôt
(`.github/workflows/ci.yml`, `db-backup.yml`, `pipeline-quotidien.yml`) ne mentionnent ni
« SUIVI » ni « péremption » ; aucun autre fichier de ce dépôt n'implémente de vérification
automatisée de fraîcheur de ce document. Le seul mécanisme réel est le **gabarit de PR**
(`.github/pull_request_template.md`, créé le 03/08) : une case à cocher humaine, « `docs/SUIVI.md`
est à jour », lue au moment de la fusion — jamais un job CI, jamais bloquante.

Ce mécanisme a fonctionné exactement comme un gabarit fonctionne : les cinq PR de ce lot
(#78, #79, #80, #82, #83) ont chacune **honnêtement laissé la case décochée** et signalé
« non fait » dans leur section « Ce que cette PR ne vérifie pas ». Rien n'a menti — et rien
n'a non plus empêché le retard de s'accumuler sur cinq fusions, parce qu'une case décochée
n'est pas un `quality`/`docker`/`openapi-check`/`Vercel` rouge : elle ne bloque rien, elle
ne notifie personne, elle attend d'être lue.

**Leçon, du même ordre que celle du 27/07/2026** (`docs/INCIDENTS.md` : « un garde-fou qu'on
contourne par lassitude n'en est pas un ») : un gabarit décrit une intention, il ne
l'applique pas. Un vrai garde-fou serait un check CI comparant les fichiers touchés par une
PR à la présence de `docs/SUIVI.md` dans ce même diff — non construit ici (diagnostic
demandé, pas de correctif). *Il n'a pas été demandé d'en construire un ; consigné pour que
la question ne se repose pas sans réponse la prochaine fois.*

### Conformité de la collecte — suite du 04/08/2026

**Toujours bloqué sur Kamel** : l'identité juridique du responsable de traitement
(raison sociale, forme, adresse) est absente de `/confidentialite` — un repère explicite
marque l'emplacement dans le code (section Contact), volontairement non rempli plutôt
qu'inventé.

**Limites acceptées, pas des blocages** : le lieu de traitement exact des serveurs Vercel
Analytics et la durée de conservation des signaux Turnstile côté Cloudflare ne sont pas
précisés par les politiques publiques des deux fournisseurs — rien n'est affirmé sur la
page à ce sujet. La personnalisation du feed reste une finalité déclarée
(`apps/web/src/lib/consentement.ts`), pas construite.

### Suppression administrative des deals — lots 1 à 3 livrés *(05/08/2026)*

Plan en 5 lots (conception validée le 05/08/2026). Livrés : suppression douce (`deals.supprime_le`,
#87), mémoire de curation (`memoire_curation`, empreinte sans prix, #88), critère de protection
(`deals_protection`, trace de publication au journal d'audit — PR ouverte, non fusionnée). Classification
réelle mesurée sur la production : **115 lignes protégées** (113 `publie` + 2 `rejete` ayant été
publiées puis retirées — le critère les protège malgré leur statut courant), **1490 purgeables**
(643 `auto_draft`, 430 `expire`, 415 `rejete` jamais publiés, 2 `en_attente`). Ce chiffre dimensionnera
les lots 4 (purge d'image) et 5 (purge automatique).

**⚠️ Suppression douce — vérifiée en base et en test, pas par le chemin applicatif réel.** Les 142+
tests d'intégration appellent les handlers de route directement (même pattern que le reste de la
suite) ; la vérification « en production » du 05/08 a écrit directement via la connexion de
migration, faute de session admin HTTP authentifiée disponible ici (seul compte admin : Flakpak).
**Le bouton Supprimer/Restaurer du back-office (`/admin`, onglet Supprimés) n'a jamais été cliqué
réellement** — à vérifier depuis l'interface avant de considérer le lot 1 pleinement éprouvé.

### Phase 0 rouverte — le backup n'a qu'une seule copie *(02/08/2026)*

La case « 0 — Protéger l'existant » de `docs/fidwastafid-plan-v2.md` était cochée **☑ fait**
sur la foi de l'intention affichée par le workflow (« stocké hors Supabase »). Mesuré le
2026-08-02 : l'étape d'envoi vers Cloudflare R2 de `db-backup.yml` est conditionnée à
`R2_ACCOUNT_ID`/`R2_BUCKET`, **absents des secrets** — elle n'a jamais tourné, aucun objet
n'a jamais été écrit. La seule copie existante est l'**artefact GitHub, 30 jours**, et le
plan Supabase **Free** n'offre ni backup managé ni PITR : c'est une ligne de défense
unique. `RUNBOOK-restauration.md` décrivait par ailleurs une récupération « depuis R2 »
qui n'aurait rien trouvé — corrigée le même jour.

Ce qui est fait : dump + test de restauration à chaque run + gzip, et **l'alerte d'échec
notifie désormais réellement** (issue assignée + label `urgent`, #70). Le run du 2026-08-03
06:25 UTC est vert.

Ce qui reste : une copie hors GitHub. Le compte Cloudflare existe déjà (Turnstile, DNS du
domaine) — il manque un bucket R2 et quatre secrets, pas un fournisseur.

### Dette assumée, consignée ailleurs

- **Quatre montées majeures parquées** (`zod`, `typescript`, `eslint` + `@eslint/js`,
  `@types/node`, plus `@asteasolutions/zod-to-openapi` qui suit le sort de zod 4) — motifs et
  déclencheurs de réexamen dans `docs/IDEES.md`, section « Dépendances ». **Ces règles `ignore`
  sont une dette différée, pas une décision** : elles rendent le sujet invisible.
- **Cause du cache Vercel non élucidée** — `docs/INCIDENTS.md`. Le check Vercel est le seul
  garde-fou réel sur ce chemin ; il est bloquant.
- **`leaked password protection`** différée au passage Supabase Pro — `docs/IDEES.md`.
- **`/auth/confirm` ne distingue pas « jeton refusé » de « succès sans session »** — contrainte
  consignée le 02/08 dans `docs/INCIDENTS.md`. Latente : aucun e-mail n'emprunte ce chemin
  aujourd'hui. À traiter **avant** tout câblage du changement d'e-mail, pas après.
- **Un avertissement eslint** préexistant dans `apps/web/src/app/soumettre/SoumettreForm.tsx:137`
  (directive `eslint-disable` devenue inutile). Sans conséquence, jamais traité.

---

## 3 — File de travail, par ordre de priorité

Chaque entrée dit : le constat, où ça vit, et par quoi commencer.

### 3.1 — E-mails transactionnels *(priorité 1)*

**Constat, relevé au dashboard Supabase le 2026-08-02.** Deux e-mails seulement sont déclenchés
par l'application — confirmation d'inscription et réinitialisation de mot de passe
(`apps/web/src/lib/authActions.ts`). Leurs gabarits **ne vivent pas dans le dépôt** : ils sont
dans le dashboard Supabase, et aucun déploiement ne les met à jour.

| Gabarit | Déclenché par | Lien | État |
|---|---|---|---|
| Confirm sign up | `signUp()` | `/auth/confirm?token_hash={{ .TokenHash }}&type=email` | **actif**, personnalisé, français |
| Reset password | `resetPasswordForEmail()` | `/auth/reset?token_hash={{ .TokenHash }}&type=recovery` | **actif**, personnalisé, français |
| Magic link or OTP | rien | `/auth/confirm?…&type=magiclink` | dormant |
| Change email address | rien | `/auth/confirm?…&type=email_change` | dormant |

Les deux gabarits actifs n'ont jamais été ceux par défaut de Supabase : ils sont personnalisés,
rédigés en français, et surtout ils utilisent déjà `token_hash`, le **seul** mécanisme compatible
avec ce dépôt — le client ne fixe jamais `flowType`, qui vaut donc `implicit`
(`@supabase/auth-js`, défaut vérifié dans le paquet installé). Un gabarit par défaut porterait
`{{ .ConfirmationURL }}`, qui suppose PKCE, et casserait les deux parcours. Les deux gabarits
dormants l'ont porté jusqu'au 2026-08-02 — alignés sur le motif `token_hash` ce jour-là pour
qu'ils ne cassent pas le jour où un flux les déclencherait.

**Les routes du dépôt correspondent** (vérifié le 2026-08-03) :
`apps/web/src/app/auth/confirm/route.ts` accepte tout `EmailOtpType` et
`apps/web/src/app/auth/reset/route.ts` n'accepte que `recovery` — les deux appellent `verifyOtp`
puis posent le cookie de session.

**✅ Le runbook est corrigé — les trois divergences relevées le 2026-08-03 sont traitées** dans la
PR de rattrapage du même jour, avant toute application :

| Divergence | Ce qui était écrit | Ce qui est écrit maintenant |
|---|---|---|
| Accent | `#2C5545` (avant l'ajustement chromatique du 26/07) | `#2F6B57` (CONTRAT-V1 §8) |
| Bouton primaire | aplat `ink` `#1A1815` | aplat `accent` `#2F6B57` |
| Type de confirmation | `type=signup` | **`type=email`**, la valeur du gabarit en production |

La troisième était la seule vraiment coûteuse : le runbook dit lui-même que la ligne d'URL est
« la seule erreur vraiment coûteuse » de la procédure, et il divergeait de la production
précisément là. Les deux valeurs existent dans `EmailOtpType`, mais la documentation Supabase
n'emploie que `type=email` (4 occurrences, aucune de `signup`) — et surtout un runbook n'a pas le
droit de prescrire autre chose que ce qui tourne.

**Ce qui reste vrai, et reste à faire** : les **corps** des quatre gabarits ne sont pas en charte
Tadelakt — HTML nu (`<h2>`, `<p>`, lien brut), ni couleur, ni structure, ni sceau. C'est le seul
écart de charte restant, et c'est ce qui justifie encore la priorité 1. **C'est un défaut
esthétique, pas une panne** : les deux parcours fonctionnent.

**Où.** `docs/runbooks/emails-tadelakt.md` — corrigé, applicable tel quel. Limite conservée : il
ne couvre que les **deux gabarits actifs**, pas les deux dormants (`magiclink`, `email_change`).

**Par quoi commencer.** Il ne reste que du geste externe : **coller les corps dans le dashboard
Supabase** (Authentication → Emails), puis envoyer un e-mail de test sur chaque parcours
(§5 du runbook). Aucune PR ne peut porter cette partie — je n'ai pas d'accès en écriture au
dashboard, le connecteur Supabase est en lecture seule (CONTRAT-V1 §7). C'est là qu'est le risque
que ça reste indéfiniment en attente, et il n'est pas technique.

### 3.2 — Diffusion communautaire : Telegram et Discord *(priorité 2)*

**Constat.** Le levier d'audience décidé : au Maroc, les réseaux sont le point d'entrée, le site
la destination.

**Les deux canaux sont LIVRÉS** (#72 puis #73, fusionnés le 02/08/2026) — CONTRAT-V1 §4, huitième
amendement conscient et sa révision du même jour :

| Ce qui existe | Détail |
|---|---|
| Endpoints | `POST`/`DELETE /api/v1/admin/deals/:publicId/diffuser/telegram` et `…/discord` — **le canal est dans le chemin**, les deux canaux se diffusent et s'annulent indépendamment |
| Base | `diffusions` (migration `0011`), `unique (deal_id, canal)` ; `external_message_id` en `text` (migration `0012`) |
| Logique commune | `_lib/diffusion.ts` — gardes, ordre envoi→écriture, traduction des échecs, écrits **une** fois ; les routes ne font que nommer leur canal (`_lib/diffusionCanal.ts`) |
| Back-office | Boutons de diffusion par canal sur les deals publiés |

**Le chemin complet a été éprouvé en envoi réel — six lignes de `journal_audit`, relevées le
2026-08-03.** La table `diffusions` est vide (`count(*)` = 0), mais le journal d'audit garde la
trace complète et nominative des trois allers-retours :

| # | Action | Deal | `canalTest` | Horodatage (UTC) |
|---|---|---|---|---|
| 250 / 251 | `diffuser_telegram` → `annuler_diffusion_telegram` | `wiepwspe2e` | **`false`** | 02/08 19:25 → 19:26 |
| 252 / 253 | `diffuser_telegram` → `annuler_diffusion_telegram` | `stdie4jkhr` | **`false`** | 02/08 19:26 → 19:27 |
| 254 / 255 | `diffuser_discord` → `annuler_diffusion_discord` | `kwm8x4chk9` | **`false`** | 02/08 20:00 → 20:01 |

L'écriture fonctionne, l'anti-double-envoi `unique (deal_id, canal)` a eu de vraies lignes à
protéger, et le `DELETE` a réellement supprimé les messages distants.

> ⚠️ **Un `count(*)` à zéro mesure un ÉTAT, jamais une HISTOIRE.** Une première lecture de ce
> même chiffre avait conclu « jamais exercé une seule fois » — faux. Sur une table où
> l'annulation est une fonctionnalité du produit, le nombre de lignes vivantes ne peut pas servir
> de preuve d'absence. Même famille d'erreur que la valeur de repli ambiguë
> (`docs/INCIDENTS.md`) : une seule observation à qui l'on fait dire deux choses.
>
> **Et la deuxième lecture a reproduit l'erreur d'un cran.** Pour établir le paragraphe
> ci-dessus, la version précédente de ce document est passée par `pg_stat_user_tables` et
> `diffusions_id_seq` — des compteurs qui donnent « 3 insertions, 3 suppressions » sans dire
> **qui**, **quand**, ni **sur quel canal**. Elle en a conclu que rien n'était tracé. Or
> `journal_audit` contenait déjà les six lignes ci-dessus, avec l'admin, l'horodatage,
> l'identifiant du message et la destination. *Chercher la preuve dans une source pauvre puis
> conclure de sa pauvreté à l'absence de preuve : c'est la même faute, commise sur l'outil de
> mesure au lieu de la donnée.*

**Le blocage « tout envoi est définitif » est levé** : `DELETE` existe sur les deux canaux (voie
(2) évoquée le 02/08), et Discord est appelé avec `?wait=true` précisément pour récupérer
l'identifiant du message — sans lui la diffusion serait indélébile. Les trois annulations
ci-dessus le démontrent en production, pas sur le papier.

✅ **La diffusion EST tracée, sur les deux chemins.** `_lib/diffusion.ts` appelle `logAudit()`
après l'envoi (`diffuser_<canal>`) **et** après l'annulation (`annuler_diffusion_<canal>`),
depuis `61d29bb` — le commit même qui a créé le fichier. Chaque entrée porte l'`admin_id`, le
`public_id` du deal, l'identifiant du message distant et le champ `canalTest`. *La version
précédente de ce document affirmait l'inverse ; c'était faux, et corrigé ici sur relevé en base.*

✅ **La trace est désormais transactionnelle** (#77). Les deux chemins passent le `client` de
`withTransaction()` à `logAudit()`, comme la modération (`update_deal`, `bulk_update_statut`) et
comme le demande l'en-tête de `_lib/audit.ts` : « on ne veut pas d'action admin sans sa trace, ni
l'inverse ». Ils enchaînaient auparavant deux requêtes autocommit — une coupure entre les deux
laissait une diffusion sans auteur, et côté annulation ne laissait **rien du tout** (c'est le seul
chemin admin du dépôt où l'action efface sa propre preuve). Ajouté au passage : un envoi abouti
dont l'écriture en base échoue journalise `diffusion_<canal>_orpheline` avec l'identifiant du
message, parce qu'il reste alors **vivant dans le canal** sans que l'API puisse l'annuler.

> ⚠️ **La destination : les trois envois réels sont partis sur le canal PUBLIC.** Les six entrées
> d'audit portent toutes `canalTest: false`. Ce n'est plus une hypothèse — le code lit une
> variable de test qui prime sur la variable publique (`TELEGRAM_CHAT_ID_TEST` sur
> `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL_TEST` sur `DISCORD_WEBHOOK_URL`, jamais un test de
> `NODE_ENV`), et le 02/08 aucune des deux `_TEST` n'était posée. L'état actuel des quatre
> variables **n'a pas été revérifié** et ne se lit que dans le dashboard Vercel, hors de ma
> portée. **À faire avant de cliquer : poser les deux `_TEST` sur un canal jetable, et confirmer
> par le champ `canalTest` de la réponse lequel des deux vient de se produire.**

**WhatsApp reste entier**, et reste semi-manuel par décision : l'API officielle Meta ne poste pas
dans les groupes, les bibliothèques non officielles risquent le ban du numéro (refusé). Le
message formaté prêt à coller n'est pas écrit.

**Où.** `docs/IDEES.md`, section « Diffusion communautaire » — liens d'invitation officiels et
architecture. `config/community.ts` reste à créer (liens en clair, ce ne sont pas des secrets).

### 3.3 — Qualité de recherche : accents, index, pertinence *(priorité 3)*

**La recherche serveur est LIVRÉE — ne pas la remettre dans la file.** Le lot 7 l'a faite : `q`
sur `GET /api/v1/deals`, `ilike` sur le titre et l'enseigne, jokers échappés, valeur portée par
l'URL. Avant, la recherche ne filtrait que les deals déjà téléchargés — au-delà de la première
page, elle ne trouvait rien. Ce chantier-ci est donc le SUIVANT, pas le même : il ne porte plus
sur *où* filtre la recherche, mais sur ce qu'elle vaut.

**Ce qui reste, mesuré :**

- **Pas d'insensibilité aux accents.** Vérifié en base : `titre ilike '%electromenager%'` renvoie
  0, `'%électroménager%'` aussi — mais surtout, aucun de ces deux termes ne trouvera l'autre. Un
  utilisateur qui tape sans accent ne trouve rien.
- **Aucun index sur `titre`** (vérifié : 0 index le mentionnant), et `ilike '%…%'` ne peut de
  toute façon pas utiliser un btree classique. À 113 deals publiés c'est sans effet ; ça se
  dégrade linéairement, et la table porte déjà 1 592 lignes toutes catégories de statut
  confondues.
- **Aucun classement par pertinence** : un deal dont le titre commence par le terme ne remonte pas
  avant un autre où il apparaît en fin.

**Par quoi commencer.** `unaccent` + `pg_trgm` (extensions Supabase disponibles), index GIN
trigramme sur `lower(unaccent(titre))`. Mesurer avant : à ce volume, la seule correction qui
change quelque chose pour l'utilisateur est l'insensibilité aux accents.

### 3.4 — Badge de `/compte` rendu à la main *(priorité 4)*

**Constat.** `apps/web/src/app/compte/page.tsx` rend le statut de chaque deal (« Publié »,
« En attente », « Refusé », « Expiré », « Brouillon ») avec un `<span>` maison et sa propre table
de classes (`STATUT_BADGE`), alors que la primitive `Badge` existe et couvre exactement ce cas.
C'est la dérive que le CONTRAT-V1 §8 règle 6 cherche à empêcher.

**Ce qui bloque.** La migration n'est pas neutre visuellement : `rejete` et `auto_draft` utilisent
`bg-surface-subtle`, sans équivalent exact parmi les variantes de `Badge` — la plus proche est
`outline`, transparente et cerclée. **C'est une décision de charte, pas un remplacement
mécanique.**

**Par quoi commencer.** Trancher le rendu de ces deux états neutres, puis migrer. Le reste
(`publie` → `accent`, `en_attente` → `warn`, `expire` → `cold`) correspond déjà, et `expire` →
`cold` est même ce qu'impose §8 règle 3.

### 3.5 — État voté persistant *(priorité 5)*

**Constat.** `CardVote` affiche un état « voté » (fond plein `hot`/`cold`) **optimiste côté
client** : le composant ne reçoit que le score du deal, jamais le sens du vote de l'utilisateur
courant. L'état ne survit donc pas à un rechargement — on revote sans savoir qu'on avait déjà
voté.

**Où.** `docs/IDEES.md`, section « Refonte Tadelakt — suites ».

**Par quoi commencer.** Exposer le vote courant de l'utilisateur authentifié dans la
représentation du deal. Attention : cela touche `dealSchema`, donc le modèle de domaine du
CONTRAT-V1 §3 et la spec OpenAPI — c'est un amendement, à assumer comme tel. Le champ ne doit
apparaître que pour une requête authentifiée, et son absence ne doit pas se détecter en creux
(même règle que `whatsappContact`, §4).

---

## 4 — Ce qu'il faut savoir avant de toucher au code

- **Les identifiants publics** (`public_id`) sont des nanoid de 10 caractères sur un alphabet
  restreint **sans `0`, `1`, `l` ni `o`** (anti-confusion). Une contrainte `CHECK` en base le fait
  respecter. Toute fixture écrite à la main doit passer `publicIdSchema` — un test hors ligne le
  vérifie (`apps/web/tests/fixtures.ts`, `packages/db/src/seedFixtures.ts`), après une régression
  réelle du 28/07/2026.
- **Les primitives de charte se conservent sans appelant** (CONTRAT-V1 §8 règle 6). `Chip` n'en a
  plus depuis le lot 7 : elle est gardée, et `apps/web/tests/primitives.ts` la rattache aux tokens
  courants. La supprimer est un amendement du contrat, jamais un nettoyage.
- **Le pipeline écrit directement en base**, hors `/api/v1` — exception documentée, pas une
  entorse au principe « toutes les écritures utilisateur passent par l'API ».
- **Les tests unitaires sont hors ligne** : ni réseau ni base. Ce qui exige un vrai Postgres vit
  dans `apps/web/tests/integration.ts`, job CI séparé — non bloquant parce que Dependabot n'a pas
  les secrets, **pas** pour laisser passer une régression.
- **Les migrations s'exécutent sur le port 5432** (Session pooler) exclusivement, sur confirmation
  explicite et par opération (CONTRAT-V1 §7). Le 6543 est réservé à l'app serverless : il n'a pas
  d'advisory lock, une migration y échoue ou s'applique à moitié.
