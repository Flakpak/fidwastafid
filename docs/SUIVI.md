# SUIVI — état à date et file de travail

*Dernière mise à jour : 2026-08-02, sur `main` à `1428ba9`.*

Ce document est le **point d'entrée pour reprendre le travail sans contexte préalable**. Il dit
ce qui tourne, ce qui reste ouvert, et par quoi continuer. Il ne remplace aucun autre document :
il y renvoie.

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
`main` est protégée, cinq jobs CI bloquants (`quality`, `openapi-check`, `migrations-check`,
`docker`, `integration`) plus le check Vercel.

---

## 1 — Ce qui tourne en production

**https://fidwastafid.com** — déployé depuis `main` par Vercel à chaque fusion.

### Chiffres réels au 2026-08-02

Relevés en base, pas estimés : **93 deals publiés**, **7 enseignes curées**, **2 villes**
distinctes portant des deals publiés, **4 comptes membres**. Ces nombres importent pour la suite
(voir §3.2) : le site en affiche d'autres.

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
- **Pages enseigne** (`/enseigne/[slug]`), concept, charte, confidentialité, contact.
- **Soumission communautaire** (`/soumettre`) — authentifiée, Turnstile, photo optionnelle,
  toujours créée en `en_attente`.
- **Espace membre** (`/compte`) — identité, couleur d'avatar, compteurs, « mes deals » avec motif
  de rejet visible, export/suppression de compte (loi 09-08).
- **Back-office** (`/admin`) — pipeline de curation, édition complète d'un deal, actions
  groupées, récupération et upload d'image, motif de rejet obligatoire.
- **Pipeline quotidien** (`apps/pipeline`) — scraping multi-sources, insertion directe en base,
  expiration des `auto_draft` de plus de 14 jours, revalidation du cache déclenchée par GitHub
  Actions.
- **API** (`/api/v1/*`) — liste fermée, documentée au CONTRAT-V1 §4, spec générée
  (`apps/web/public/openapi.json`) et vérifiée en CI.

### Dernier lot livré — lot 7, refonte des filtres du feed

Fusionné le 2026-08-02. Trois défauts de production corrigés (pile collante laissant passer le
feed, défilement horizontal en mobile, tri présenté comme un filtre) et trois défauts latents
découverts en chemin : la recherche ne filtrait que les deals déjà téléchargés, le filtre `type`
excluait les deals `les_deux` des deux côtés, et un curseur de pagination pouvait être rejoué
d'un jeu de filtres à l'autre. Détail dans l'historique git et au CONTRAT-V1 §4 (septième
amendement conscient : `GET /api/v1/deals/compte`).

---

## 2 — Ce qui reste ouvert

### Pull requests

Aucune PR de travail ouverte. Six PR Dependabot en attente de tri (#32, #58, #60, #61, #62, #63).
Un délai de refroidissement de 2 jours est configuré (`.github/dependabot.yml`), aligné sur la
politique pnpm `minimumReleaseAge` de 24 h — les mises à jour de **sécurité** en sont exemptées et
ne sont jamais retardées.

### Dette assumée, consignée ailleurs

- **Quatre montées majeures parquées** (`zod`, `typescript`, `eslint` + `@eslint/js`,
  `@types/node`, plus `@asteasolutions/zod-to-openapi` qui suit le sort de zod 4) — motifs et
  déclencheurs de réexamen dans `docs/IDEES.md`, section « Dépendances ». **Ces règles `ignore`
  sont une dette différée, pas une décision** : elles rendent le sujet invisible.
- **Cause du cache Vercel non élucidée** — `docs/INCIDENTS.md`. Le check Vercel est le seul
  garde-fou réel sur ce chemin ; il est bloquant.
- **`leaked password protection`** différée au passage Supabase Pro — `docs/IDEES.md`.
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

**Ce que cette section affirmait, et qui était faux** : « ils sont encore aux gabarits par défaut
de Supabase ». Les deux gabarits actifs n'ont jamais été ceux par défaut — ils sont personnalisés,
rédigés en français, et surtout ils utilisent déjà `token_hash`, le **seul** mécanisme compatible
avec ce dépôt : le client ne fixe jamais `flowType`, qui vaut donc `implicit`
(`@supabase/auth-js`, défaut vérifié dans le paquet installé). Un gabarit par défaut porterait
`{{ .ConfirmationURL }}`, qui suppose PKCE, et casserait les deux parcours. Les deux gabarits
dormants, eux, l'ont porté jusqu'au 2026-08-02 — alignés sur le motif `token_hash` ce jour-là pour
qu'ils ne cassent pas le jour où un flux les déclencherait (voir `docs/IDEES.md`, aucun ne l'est
aujourd'hui). Les quatre objets sont passés en français au même moment.

**Ce qui reste vrai, et reste à faire** : les **corps** des quatre gabarits ne sont pas en charte
Tadelakt — HTML nu (`<h2>`, `<p>`, lien brut), ni couleur, ni structure, ni sceau. C'est le seul
écart de charte restant, et c'est ce qui justifie encore la priorité 1.

**Où.** `docs/runbooks/emails-tadelakt.md` — le runbook est écrit, les gabarits en charte Tadelakt
y sont prêts à coller. ⚠️ **Le runbook lui-même est à corriger avant d'être appliqué** : écrit au
lot 3, il précède l'ajustement chromatique du 26/07/2026 (CONTRAT-V1 §8). Il emploie l'ancien
accent `#2C5545` (désormais `#2F6B57`) et un bouton primaire en `ink` `#1A1815`, alors que le
bouton primaire est repassé en `accent`. Le coller tel quel réintroduirait deux écarts que le
contrat a explicitement tranchés. Il ne couvre par ailleurs que les deux gabarits actifs.

**Par quoi commencer.** C'est une **action de configuration externe**, pas du code : corriger les
deux couleurs du runbook, coller les corps dans Supabase, envoyer un e-mail de test sur chaque
parcours. Aucune PR n'est nécessaire pour la partie Supabase — d'où le risque que ça reste
indéfiniment en attente.

### 3.2 — `/concept` affirme des chiffres FAUX *(priorité 2)*

**Constat, mesuré.** `apps/web/src/app/concept/page.tsx` affiche trois statistiques : « 100%
Gratuit », « **+50** Enseignes », « **+20** Villes ». La base contient **7 enseignes curées** et
**2 villes** portant des deals publiés — et l'enum `VILLES` n'en compte que **9 au total**, donc
« +20 villes » est inatteignable par construction.

**Pourquoi si haut dans la file.** C'est exactement la faute du lot 4, déjà consignée au
CONTRAT-V1 §8 règle 5 : des chiffres d'audience inventés, écrits en dur, sans source. Le contenu
avait alors été restauré à l'identique ; ces trois-là ont survécu. Et c'est **une affirmation
fausse sur la page qui explique la plateforme** — celle vers laquelle pointent la colonne du feed,
la ligne de clôture du hero et le pied de page. Une plateforme dont le discours repose sur
« jamais de prix deviné » ne peut pas se présenter par un chiffre inventé.

**Deux options, à trancher :**

1. **Brancher sur des données réelles** — compteurs calculés en base, et accepter d'afficher 7 et
   2 aujourd'hui. Honnête, et le nombre grandit tout seul. Coût : une requête de plus sur une page
   statique, et il faut assumer de petits nombres au lancement.
2. **Retirer les chiffres** — remplacer les trois statistiques par un discours qui ne chiffre
   rien. Aucun coût technique, aucune donnée à tenir à jour, et rien à réexpliquer quand les
   nombres bougent.

Ne pas laisser un chiffre faux au motif qu'il est flatteur : c'est précisément ce qu'interdit la
règle 5.

### 3.3 — Diffusion Telegram / Discord *(priorité 3)*

**Constat.** Le levier d'audience décidé : au Maroc, les réseaux sont le point d'entrée, le site
la destination. Rien n'est encore construit.

**Où.** `docs/IDEES.md`, section « Diffusion communautaire » — l'architecture est **déjà
tranchée** : bouton « Diffuser » dans l'admin sur chaque deal publié (curation manuelle en v1,
pas de seuil automatique — la diffusion crée le volume de votes, pas l'inverse) ; Telegram par
Bot API (`sendPhoto` + légende) ; Discord par webhook entrant ; WhatsApp semi-manuel assumé
(l'API Meta ne poste pas dans les groupes, les libs non officielles risquent le ban du numéro —
refusé). Table `diffusions` pour l'anti-double-publication, UTM sur tout lien diffusé.

**Par quoi commencer.** Créer `config/community.ts` (liens d'invitation, constantes en clair —
ce ne sont pas des secrets), puis la migration `diffusions`, puis Telegram seul. Les jetons de bot
et l'URL de webhook sont des variables d'environnement, jamais commités.

### 3.4 — Qualité de recherche : accents, index, pertinence *(priorité 4)*

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
  toute façon pas utiliser un btree classique. À 93 deals c'est sans effet ; ça se dégrade
  linéairement.
- **Aucun classement par pertinence** : un deal dont le titre commence par le terme ne remonte pas
  avant un autre où il apparaît en fin.

**Par quoi commencer.** `unaccent` + `pg_trgm` (extensions Supabase disponibles), index GIN
trigramme sur `lower(unaccent(titre))`. Mesurer avant : à ce volume, la seule correction qui
change quelque chose pour l'utilisateur est l'insensibilité aux accents.

### 3.5 — Badge de `/compte` rendu à la main *(priorité 5)*

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

### 3.6 — État voté persistant *(priorité 6)*

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
