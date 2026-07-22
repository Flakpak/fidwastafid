# IDÉES — à trier après la mise en prod de la v2

*(CONTRAT-V1.md / PRINCIPES NON NÉGOCIABLES §6 : aucune feature ajoutée en cours de phase — les idées atterrissent ici, triées après la Phase 6.)*

## Dette technique temporaire

- `apps/web/src/app/api/v1/_lib/turnstile.ts` : log temporaire
  (`[turnstile-diag]`) des `error-codes`/`hostname` retournés par
  `siteverify` en cas d'échec — ajouté pour diagnostiquer le rejet
  Turnstile en préversion (post-Bloc 5). À retirer une fois la cause
  confirmée via les logs Vercel.

## Scaffold Vite/React racine résiduel (2026-07-21)

`index.html`, `vite.config.js`, `src/App.jsx`, `src/main.jsx`,
`src/index.css`, `src/assets` à la racine du repo, plus les scripts
`dev`/`build`/`preview` (et les dépendances `vite`/`react`/`react-dom`)
du `package.json` racine : reliquat du prototype v1 (avant le passage à
Next.js dans `apps/web`, cf. `docs/fidwastafid-plan-v2.md` — « PAS
src/App.jsx, prototype orphelin »). Découvert lors du lot nettoyage
outillage mort du 21/07/2026 : `index.html` s'est révélé être une
référence active (`pnpm build` racine dépend de lui via la convention
d'entrée par défaut de Vite), donc non supprimable par un simple `git
rm`. Décommissionner proprement nécessite de retirer aussi
`vite.config.js`, `src/`, les scripts et les dépendances associées du
`package.json` racine — plus gros qu'une suppression isolée, chantier à
part.

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
ci-dessus.

**Mise à jour (18/07/2026)** : la partie « page profil minimale (pseudo,
email) + Mes deals » est livrée — `/compte` (4 cartes : identité avec
couleur d'avatar, contributions avec compteurs et liste `mesDeals`,
données/RGPD, suppression de compte). Ce qui reste une idée, pas encore
fait : l'**édition** des deals depuis `/compte` — nécessite un amendement
du contrat API (`PATCH` deal par son auteur → repasse `en_attente`, hors
de la liste fermée actuelle §4).

## Profil public /membre (2026-07-17)

`/membre/[pseudo]-[public_id]` réservé au contrat §2 mais jamais
construit — profil public consultable par tous (distinct de `/compte`,
qui est privé et authentifié). Dépendance directe : les enrichissements
« profil auteur » envisagés sur la page deal (membre depuis, nombre de
deals partagés, cf. entrée « Page deal — profil auteur » ci-dessous).

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

## Page deal — profil auteur (2026-07-17)

Enrichissements profil auteur (membre depuis, nombre de deals partagés) :
dépend du futur `/membre/[pseudo]-[public_id]` réservé au contrat §2.

## Diversification des sources (2026-07-18)

Le pipeline ne scrape aujourd'hui que Bringo (`scraper-bringo.mjs`).
Marjane a déjà été exploré via `discover-site.mjs` (capture des appels API
+ rendu HTML, début juillet) sans suite donnée. Étendre à d'autres
enseignes (Marjane, Carrefour direct hors Bringo, etc.) élargirait la
couverture au-delà du catalogue actuel — chantier de découverte +
adaptation par source, un par un, post-Phase 7.

## Galerie multi-images (2026-07-18)

Chaque deal n'a aujourd'hui qu'une seule image (`deals.image_key`, module
pipeline `images.mjs`). Idée : galerie multi-images sur la page deal
(plusieurs angles/photos par produit, façon Dealabs) — nécessite d'étendre
le schéma (table `deal_images` ou tableau de clés sur `deals`) et le
pipeline d'extraction pour produire plusieurs images par deal quand la
source en fournit plusieurs.

## Staging Supabase — flux recette/prod (2026-07-18)

Aucun environnement de recette aujourd'hui : la seule base Postgres est
la prod (`fidwastafid-prod`, ex-aswbu), testée uniquement via Docker local
avant chaque déploiement. Idée : second projet Supabase gratuit dédié à
la recette, avec les variables d'environnement Preview Vercel pointant
vers ce projet staging plutôt que vers la prod — permettrait de tester des
migrations et changements risqués sur une base isolée avant qu'ils
n'atteignent la prod. Post-Phase 6, à évaluer contre le coût de
maintenance (deux schémas à garder synchronisés) pour un projet solo.

## Monétisation

Deals sponsorisés = colonne `sponsorise` boolean + badge sur la carte + critère de tri, post-Phase 6, quand il y aura un premier annonceur réel. Affiliation = paramètre de tracking sur le champ `lien` existant. Display ads (AdSense & co) : ÉCARTÉ — incompatible CSP par nonce, contraire au positionnement premium, rentable uniquement à fort volume.

## Stratégie d'audience (2026-07-20)

Cible primaire : Marocains résidents. Segment secondaire **stratégique**
(pas juste accessoire) : les MRE (Marocains résidant à l'étranger).

- **Pics saisonniers** : trafic MRE concentré sur l'été (retour au pays),
  période de forte consommation locale — à garder en tête pour tout
  calendrier éditorial ou opération commerciale future.
- **Rôle prescripteur** : un MRE qui repère un bon plan avant/pendant son
  séjour le partage à ses proches résidents (mécanique de partage
  WhatsApp, déjà le canal de diffusion naturel du site) — un lecteur MRE
  génère de la portée au-delà de sa propre lecture.
- **Langue** : le français est leur langue primaire de recherche/lecture,
  le site les sert donc déjà nativement, sans adaptation de contenu.
- **Implication GEO** : le déploiement Google AI Overviews/AI Mode en
  France (annoncé avant le 23/09/2026) concerne les recherches
  préparatoires des MRE **depuis la France** — le Maroc est déjà couvert
  par ce type de résultat depuis 2025, donc sans nouveauté à anticiper
  côté résidents.

**Décision** : pas de catégorie ni de contenu « spécial MRE » créé par
anticipation, sans données d'usage réelles pour le justifier — même
doctrine que la catégorie "Enfants" (absente de l'enum `categorie`,
réexaminée seulement si les données le justifient un jour, cf. Phase 7A).
Un segment stratégique n'est pas une raison de complexifier le modèle de
données à l'aveugle.

**Micro-actions GEO retenues** (coût zéro, à faire après le 23/07/2026— pas
avant, cf. Phase 6/rendez-vous suppression v1 en priorité) :
1. ~~Vérifier le balisage `schema.org` `Product`/`Offer` sur les pages deal~~
   — **fait le 21/07/2026** : `image` pointait vers le PNG générique du
   site même quand le deal avait une vraie photo, `seller` absent malgré
   une enseigne renseignée, `availability` d'un deal expiré en
   `OutOfStock` plutôt que `SoldOut` — corrigés (cf. section SEO ci-dessous).
2. ~~Autoriser explicitement les crawlers IA dans `robots.txt`~~ — **fait
   le 21/07/2026** : blocs explicites `Allow: /` pour GPTBot, OAI-SearchBot,
   ChatGPT-User, ClaudeBot, Claude-Web, anthropic-ai, PerplexityBot,
   Google-Extended, Applebot-Extended, CCBot, meta-externalagent.
3. Mettre en place une surveillance des rapports "résultats génératifs" de
   Search Console (dès qu'ils sont disponibles pour le site).

**SEA** : non-sujet avant l'existence d'un revenu — même logique que la
décision Vercel Pro (pas de dépense avant qu'il y ait quelque chose à
rentabiliser).

## SEO (2026-07-21)

URLs fantômes de l'ancien propriétaire du domaine
(`www.fidwastafid.com/*.htm`, petites annonces Algérie) encore présentes
dans l'index Google — constaté lors du lot GEO (vérification robots.txt/
redirection www). Décision : laisser mourir en 404 naturellement, vérifier
la redirection www→apex plus tard (constat fait, comportement actuel :
`http(s)://www.` redirige en 308 vers l'apex `https://fidwastafid.com/`,
correctif hors périmètre de ce lot). Aucun chantier immédiat.

## Diffusion communautaire (canaux sociaux)

Statut : chantier accepté, planifié après le 23/07.

Constat fondateur : les Marocains vivent sur WhatsApp ; les réseaux sont
le point d'entrée, le site est la destination. La communauté se
construira plus vite dans les groupes que par le trafic web direct.

Liens officiels (future source de vérité code : `config/community.ts`,
consommé par footer + bouton Diffuser ; liens publics d'invitation, pas
des secrets, constantes en clair acceptées ; toute révocation = mise à
jour de la constante unique) :
- WhatsApp : https://chat.whatsapp.com/GKxwVwHnc9b5rgxhvSXalC
- Telegram : https://t.me/+THGAhGachec2NzM0
  (@fidwastafid indisponible — lien d'invitation privé assumé en v1)
- Discord : https://discord.gg/w4dVspdmKS (invitation permanente)

Architecture décidée :
- v1 = curation manuelle : bouton « Diffuser » dans l'admin sur chaque
  deal publié. Pas de seuil de votes automatique en v1 (base de votes
  quasi nulle au lancement — la diffusion crée le volume de votes, pas
  l'inverse).
- Telegram : automatisé (Bot API officielle, `sendPhoto` + légende).
- Discord : automatisé (webhook entrant, embed image/prix/lien).
- WhatsApp : semi-manuel assumé (message formaté prêt à coller) — l'API
  officielle Meta ne poste pas dans les groupes ; libs non officielles =
  risque de ban du numéro, refusé.
- Traçabilité : table `diffusions` (`deal_id`, `canal`, `diffuse_at`) —
  anti-double-publication + historique.
- Mesure : tout lien diffusé porte
  `utm_source=whatsapp|telegram|discord&utm_medium=social&utm_campaign=diffusion`,
  lecture Vercel Analytics. Les données UTM décident de la v2.
- v2 (conditionnée aux données) : seuil automatique paramétrable,
  WhatsApp Channels si API officielle, reprise de @fidwastafid si le nom
  se libère.
- Secrets futurs (token bot Telegram, URL webhook Discord) : variables
  d'environnement uniquement.

## Taxonomie — réserve v3 (2026-07-21)

Suite à l'extension 8→12 catégories (`CONTRAT-V1` §3, cinquième amendement
conscient du 21/07/2026 : `Téléphonie & Internet`, `Gaming`, `Bricolage &
Jardin`, `Voyages`), quatre candidates supplémentaires identifiées mais
**gelées**, pas ajoutées à l'enum tant que l'usage réel ne les justifie
pas :

- Auto & Moto
- Culture & Loisirs
- Services & Abonnements
- Famille & Enfants — **gelée par décision produit** : pas sans données
  (le mapping Bringo `mapCategorie()` retombe déjà par erreur sur une
  valeur `"Enfants"` absente de l'enum sur les mots-clés bébé/enfant/jouet,
  systématiquement rejetée à la validation — cf. `validation.test.mjs`.
  Ce n'est pas un précédent : aucune catégorie enfants/famille tant que
  des données d'usage réelles ne motivent la décision).

Déblocage : uniquement piloté par les données réelles d'usage (recherche
Search Console, répartition des soumissions/deals catalogue une fois le
pipeline multi-sources actif), jamais spéculativement — même principe que
les facettes croisées et les tables ville/catégorie dédiées (CONTRAT-V1,
« Ce que ce contrat NE couvre PAS »).

## Sécurité — leaked password protection différée (2026-07-22)

Leaked password protection (vérification HaveIBeenPwned à l'inscription/
changement de mot de passe) : fonctionnalité Supabase Pro — activation
différée au passage Pro, groupé avec Vercel Pro au premier revenu (même
logique de bascule que le reste de l'infra managée, cf.
`fidwastafid-plan-v2.md`). `WARN` `auth_leaked_password_protection` assumé
d'ici là dans l'advisor Supabase — état nominal documenté au CONTRAT-V1 §9
(constat du 22/07/2026, revue sécurité mensuelle,
`docs/RUNBOOK-securite.md`), pas un oubli.
