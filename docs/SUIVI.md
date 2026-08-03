# SUIVI — état à date et file de travail

*Dernière mise à jour : 2026-08-03, sur `main` à `61d29bb`.*

Ce document est le **point d'entrée pour reprendre le travail sans contexte préalable**. Il dit
ce qui tourne, ce qui reste ouvert, et par quoi continuer. Il ne remplace aucun autre document :
il y renvoie.

> **Ce document se périme à chaque fusion.** Sa version précédente datait de `1428ba9` et
> affirmait encore, la veille, que Telegram n'était pas éprouvé et que Discord restait
> entier — alors que deux PR l'avaient livré. Un état à date qui retarde fait arbitrer sur un
> monde qui n'existe plus ; **la relecture de ce fichier fait partie de la fusion**, pas du
> ménage d'après.

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
déploiement de production : `61d29bb`, `success`, 2026-08-02 20:05 UTC.

### Chiffres réels au 2026-08-03

Relevés en base par le connecteur Supabase en lecture seule, pas estimés :

| Mesure | Valeur | (au 2026-08-02) |
|---|---|---|
| Deals `publie` | **113** | 93 |
| Deals toutes lignes confondues | **1 553** | — |
| Deals `auto_draft` (file de curation) | **645** | — |
| Deals `en_attente` (soumissions humaines) | **0** | — |
| Enseignes curées | **9** | 7 |
| Villes distinctes portant un deal publié | **2** | 2 |
| Comptes membres (`users`) | **4** | 4 |
| Lignes `diffusions` **vivantes** | **0** | — |
| Diffusions **historiques** (`pg_stat_user_tables`) | **3 insérées, 3 supprimées** | — |

Ces nombres importent pour la suite (voir §3.2) : le site en affiche d'autres.

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
- **Pages enseigne** (`/enseigne/[slug]`), concept, charte, confidentialité, contact.
- **Soumission communautaire** (`/soumettre`) — authentifiée, Turnstile, photo optionnelle,
  toujours créée en `en_attente`.
- **Espace membre** (`/compte`) — identité, couleur d'avatar, compteurs, « mes deals » avec motif
  de rejet visible, export/suppression de compte (loi 09-08).
- **Back-office** (`/admin`) — pipeline de curation, édition complète d'un deal, actions
  groupées, récupération et upload d'image, motif de rejet obligatoire, **boutons de diffusion
  Telegram et Discord** (voir §3.3).
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

**⚠️ Divergence relevée le 2026-08-03, à corriger avant application.**
`docs/runbooks/emails-tadelakt.md` prescrit `…/auth/confirm?token_hash=…&**type=signup**` pour la
confirmation d'inscription, alors que le gabarit **en production** porte `type=email` — qui est
aussi la valeur employée par la documentation Supabase (4 occurrences, aucune de `type=signup`).
Les deux valeurs existent dans `EmailOtpType`, mais le runbook et la production ne peuvent pas
diverger sur la ligne dont il dit lui-même qu'elle est « la seule erreur vraiment coûteuse ».
**Aligner le runbook sur `type=email`.**

**Ce qui reste vrai, et reste à faire** : les **corps** des quatre gabarits ne sont pas en charte
Tadelakt — HTML nu (`<h2>`, `<p>`, lien brut), ni couleur, ni structure, ni sceau. C'est le seul
écart de charte restant, et c'est ce qui justifie encore la priorité 1. **C'est un défaut
esthétique, pas une panne** : les deux parcours fonctionnent.

**Où.** `docs/runbooks/emails-tadelakt.md` — le runbook est écrit, les gabarits en charte Tadelakt
y sont prêts à coller. ⚠️ **Le runbook lui-même est à corriger avant d'être appliqué**, sur trois
points : écrit au lot 3, il précède l'ajustement chromatique du 26/07/2026 (CONTRAT-V1 §8) et
emploie l'ancien accent `#2C5545` (désormais `#2F6B57`) ainsi qu'un bouton primaire en `ink`
`#1A1815` (le bouton primaire est repassé en `accent`) ; s'y ajoute le `type=signup` ci-dessus.
Il ne couvre par ailleurs que les deux gabarits actifs.

**Par quoi commencer.** C'est une **action de configuration externe**, pas du code : corriger les
deux couleurs et le `type` du runbook, coller les corps dans Supabase, envoyer un e-mail de test
sur chaque parcours. Aucune PR n'est nécessaire pour la partie Supabase — d'où le risque que ça
reste indéfiniment en attente.

### 3.2 — `/concept` affirme des chiffres FAUX *(priorité 2)*

**Constat, mesuré le 2026-08-03.** `apps/web/src/app/concept/page.tsx` affiche trois
statistiques : « 100% Gratuit », « **+50** Enseignes », « **+20** Villes ». La base contient
**9 enseignes curées** et **2 villes** portant des deals publiés — et l'enum `VILLES` n'en compte
que **9 au total**, donc « +20 villes » est inatteignable par construction.

**Pourquoi si haut dans la file.** C'est exactement la faute du lot 4, déjà consignée au
CONTRAT-V1 §8 règle 5 : des chiffres d'audience inventés, écrits en dur, sans source. Le contenu
avait alors été restauré à l'identique ; ces trois-là ont survécu. Et c'est **une affirmation
fausse sur la page qui explique la plateforme** — celle vers laquelle pointent la colonne du feed,
la ligne de clôture du hero et le pied de page. Une plateforme dont le discours repose sur
« jamais de prix deviné » ne peut pas se présenter par un chiffre inventé.

**Deux options, à trancher :**

1. **Brancher sur des données réelles** — compteurs calculés en base, et accepter d'afficher 9 et
   2 aujourd'hui. Honnête, et le nombre grandit tout seul. Coût : une requête de plus sur une page
   statique, et il faut assumer de petits nombres au lancement.
2. **Retirer les chiffres** — remplacer les trois statistiques par un discours qui ne chiffre
   rien. Aucun coût technique, aucune donnée à tenir à jour, et rien à réexpliquer quand les
   nombres bougent.

Ne pas laisser un chiffre faux au motif qu'il est flatteur : c'est précisément ce qu'interdit la
règle 5.

### 3.3 — Diffusion communautaire : Telegram et Discord *(priorité 3)*

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

**Le chemin complet a été éprouvé en envoi réel — mesuré le 2026-08-03.** La table est vide
(`count(*)` = 0), mais `pg_stat_user_tables` compte **3 insertions et 3 suppressions**, et
`diffusions_id_seq` est à **3**. Trois diffusions ont donc bien été écrites en base, puis
annulées. L'écriture fonctionne, et l'anti-double-envoi `unique (deal_id, canal)` a eu de vraies
lignes à protéger.

> ⚠️ **Un `count(*)` à zéro mesure un ÉTAT, jamais une HISTOIRE.** Une première lecture de ce
> même chiffre avait conclu « jamais exercé une seule fois » — faux : les compteurs cumulatifs
> disent l'inverse. Sur une table où l'annulation est une fonctionnalité du produit, le nombre de
> lignes vivantes ne peut pas servir de preuve d'absence. Même famille d'erreur que la valeur de
> repli ambiguë (`docs/INCIDENTS.md`) : une seule observation à qui l'on fait dire deux choses.

**Le blocage « tout envoi est définitif » est levé** : `DELETE` existe sur les deux canaux (voie
(2) évoquée le 02/08), et Discord est appelé avec `?wait=true` précisément pour récupérer
l'identifiant du message — sans lui la diffusion serait indélébile. Les trois annulations
ci-dessus le démontrent en production, pas sur le papier.

> ⚠️ **Ce qui n'est pas tracé.** `_lib/diffusion.ts` n'écrit rien dans `journal_audit` :
> une diffusion et son annulation ne laissent aucune trace nominative, seulement une ligne qui
> apparaît puis disparaît. Après suppression, il ne reste **rien** — ni qui a diffusé, ni quand,
> ni sur quel canal. C'est la raison pour laquelle il a fallu passer par les compteurs internes
> de Postgres pour établir ce paragraphe.
>
> **Reste à vérifier avant le premier envoi** : la destination. Les deux canaux lisent une
> variable de test qui prime sur la variable publique — `TELEGRAM_CHAT_ID_TEST` sur
> `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL_TEST` sur `DISCORD_WEBHOOK_URL` — jamais un test de
> `NODE_ENV`. Au 02/08, `TELEGRAM_CHAT_ID_TEST` **n'existait pas** côté Vercel : le code
> retombait donc sur le canal **public**. L'état actuel des quatre variables n'a pas été
> revérifié depuis, et il ne se lit que dans le dashboard Vercel. **À faire avant de cliquer :
> poser les deux variables `_TEST` sur un canal jetable, et confirmer par le champ `canalTest`
> de la réponse lequel des deux vient de se produire.**

**WhatsApp reste entier**, et reste semi-manuel par décision : l'API officielle Meta ne poste pas
dans les groupes, les bibliothèques non officielles risquent le ban du numéro (refusé). Le
message formaté prêt à coller n'est pas écrit.

**Où.** `docs/IDEES.md`, section « Diffusion communautaire » — liens d'invitation officiels et
architecture. `config/community.ts` reste à créer (liens en clair, ce ne sont pas des secrets).

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
  toute façon pas utiliser un btree classique. À 113 deals publiés c'est sans effet ; ça se
  dégrade linéairement, et la table porte déjà 1 553 lignes toutes catégories de statut
  confondues.
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
- **Les migrations s'exécutent sur le port 5432** (Session pooler) exclusivement, sur confirmation
  explicite et par opération (CONTRAT-V1 §7). Le 6543 est réservé à l'app serverless : il n'a pas
  d'advisory lock, une migration y échoue ou s'applique à moitié.
