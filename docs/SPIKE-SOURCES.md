# SPIKE — Scrapabilité des sources candidates (diversification pipeline)

*Constat technique factuel, 22/07/2026 — décision produit du 21/07/2026 (taxonomie 12 catégories
en prod). Ce document n'implémente rien : zéro scraper, zéro modification d'`apps/pipeline`.
Objectif unique : éclairer la décision d'ordre de développement, prise séparément en revue.*

---

## Méthode

Lecture seule, `curl` avec User-Agent desktop réaliste, quelques requêtes GET par site (robots.txt +
1-2 pages listing + 1 page produit), aucun crawl volumineux, aucune inscription/compte créé, aucun
contournement d'anti-bot (un mur constaté = un constat, jamais un obstacle à franchir). Pour chaque
cible : comparaison du HTML brut (`curl`) au comportement attendu d'un rendu navigateur, pour trancher
statique-exploitable-en-cheerio vs nécessitant un rendu JS.

**Deux cibles ont explicitement exclu Claude par nom dans leur `robots.txt`** (`User-agent: ClaudeBot
/ Disallow: /`, cf. `marwa.com` et `iam.ma` ci-dessous) — cette règle a été respectée sans tenter de
la contourner sous un autre User-Agent : le spike s'est arrêté au constat robots.txt sur ces deux
cibles, pas de code de conduite additionnel appliqué ailleurs.

---

## 1 — electroplanet.ma (Électroménager + High-Tech + Gaming)

**a. robots.txt** — Inaccessible : `https://electroplanet.ma/robots.txt` → **403**, servi par la page
de challenge Cloudflare elle-même (`Cf-Mitigated: challenge`), pas le vrai fichier.

**b-e.** Non atteignables — voir (f).

**f. Anti-bot** — Mur Cloudflare **appliqué au domaine entier**, constaté sur 3 URLs distinctes
(`robots.txt`, apex, `www.`) — même les routes normalement publiques (`robots.txt`) sont derrière le
challenge JS managé ("Just a moment…", `CF-RAY` présent) :
```html
<title>Just a moment...</title>
<meta name="robots" content="noindex,nofollow">
...script-src 'nonce-...' 'unsafe-eval' https://challenges.cloudflare.com...
```
Aucune page du site n'a pu être observée avec un simple client HTTP.

**g.** Non observable.

**Verdict : ROUGE.** Franchir ce mur nécessiterait au minimum un navigateur headless capable de
résoudre le challenge Cloudflare (Playwright/Puppeteer), voire un service tiers de résolution —
hors du modèle "cheerio + curl" de Bringo, maintenance lourde (les challenges Cloudflare évoluent),
et risque de blocage IP/conformité. Exclu tel quel.

---

## 2 — decathlon.ma (Sport)

**a. robots.txt** — 200 OK, aucun `Disallow` pertinent sur produit/catégorie/promo (uniquement
recherche interne, filtres, modules internes). `Sitemap: sitemap-fr-index.xml` déclaré.

**b. Section promos** — **Deux surfaces distinctes**, une seule exploitable :
- `https://www.decathlon.ma/content/179-soldes` — widgets **Alpine.js non hydratés** dans le HTML
  brut : `<span class="old-price" x-text="product.regular.toFixed(2) + ' MAD'">` — expression de
  template, pas une valeur numérique. **À éviter comme source.**
- `https://www.decathlon.ma/5080-promotions` — catégorie native, **server-rendered**, vrais prix
  barrés en texte :
  ```html
  <span class="price_amount" data-testid="current-price" data-value="259">259,00 MAD</span>
  <span class="price_barred-amount" data-testid="price-before-reduction">299,00 MAD</span>
  <span class="price_discount" data-testid="discount-amount">13%</span>
  ```

**c. Rendu** — Majoritairement statique (PrestaShop server-rendered, `<article class="product-card">`
peuplé directement), sauf le widget Alpine.js de (b) ci-dessus.

**d. Plateforme** — **PrestaShop**, thème interne Decathlon **"oneshop"** (cookie
`PrestaShop-c7a0...`, `AUTH_STATE` contient `app%22%3A%22oneshop`). CDN images dédié
`contents.mediadecathlon.com`, feature-flagging Statsig.

**e. Sélecteurs (sur `/5080-promotions`)** — nom `<h2>` dans `.product-card_header`, marque
`[data-testid="product-card-brand"]`, prix promo `[data-testid="current-price"]` (`data-value`
numérique direct), prix barré `[data-testid="price-before-reduction"]`, image CDN directe
(résolution pilotable `?f=WxH`), lien `/p/{id}-{id}-{slug}.html`.

**f. Anti-bot** — Pas de mur dur (200 partout), mais **détection de bot constatée sans blocage** :
headers `x-bot: YES`, `x-ua-device: bot` sur 2 requêtes sur 6 (contenu quand même servi complet) —
signal à surveiller, pourrait durcir sans préavis.

**g. Volume** — `data-page-count="66"` × 24 produits/page ≈ **~1580 produits en promotion**.

**⚠️ Constat critique — pollution de contenu inter-tenant.** Sur 2 requêtes sur 6, `decathlon.ma`
a servi (TLS et Host corrects, vérifié `-v`) le contenu d'un **tout autre site** : une fois la
homepage entière d'un site de parapharmacie, une fois une page produit dont les métadonnées
(`<title>`, `og:title`, JSON-LD) étaient bien celles d'un sac Decathlon mais dont le corps de page
réel était celui d'un produit **`universparadiscount.ma`** (cible #5 de ce même spike) — jusqu'au
lien `href="https://universparadiscount.ma/"` dans le menu affiché. Bug de cache/edge partagé entre
tenants d'une même infra, pas un artefact de méthode.

**Verdict : ORANGE.** Développable en cheerio, surcoût en deux volets : (1) validation obligatoire
du contenu reçu par page (title/breadcrumb/JSON-LD cohérents avec l'URL demandée) + retry, à cause
du bug de cache croisé constaté ; (2) ignorer `/content/179-soldes` (Alpine.js), utiliser uniquement
les catégories natives type `/5080-promotions`.

---

## 3 — marwa.com (Mode)

**a. robots.txt** — 200 OK. `User-agent: *` a `Allow: /` (`Content-Signal: search=yes,ai-train=no,
use=reference`), mais :
```
User-agent: ClaudeBot
Disallow: /
```
(même règle pour GPTBot, Google-Extended, CCBot, Bytespider, meta-externalagent, Amazonbot,
Applebot-Extended, CloudflareBrowserRenderingCrawler.)

**b-g.** **Non évalués** — le site désigne nommément ClaudeBot avec `Disallow: /`. Continuer sous un
User-Agent de navigateur générique aurait constitué un contournement trompeur d'un signal explicite
adressé spécifiquement à Claude — le spike s'est arrêté à ce constat, sans franchir la règle.

**Verdict : ROUGE — gouvernance, pas technique.** La seule requête effectuée (`robots.txt`) a répondu
normalement (200, pas de mur Cloudflare) : rien n'indique un blocage technique. C'est une politique
déclarée du site visant l'identité Claude/Anthropic. Toute suite nécessiterait une validation de
conformité préalable (accord explicite du site, ou un processus honnêtement identifié différent de
Claude), pas un contournement.

---

## 4 — kitea.ma (Maison)

**a-g.** **Non évalués** — **zéro octet de réponse HTTP reçu.** Toutes les tentatives (`robots.txt`,
`https://` et `http://`, avec et sans `www.`) ont expiré en timeout TCP pur (SYN sans réponse), pas
un 403, pas de page Cloudflare. Le DNS résout correctement (`www.kitea.ma` → `116.202.7.135`,
plage Hetzner Allemagne). Contrôles de sanité effectués : `google.com` → 200 (connectivité sortante
générale OK) ; `jumia.ma` (autre marchand marocain, pour comparaison) → 403 applicatif classique
(TCP/TLS s'établissent, blocage HTTP, pas réseau).

**Vérification complémentaire** (moi-même, via l'outil navigateur — chemin réseau potentiellement
partagé avec le sandbox `curl`, donc pas une confirmation totalement indépendante) : navigation
`http://` et `https://` vers `www.kitea.ma` toutes deux refusées/échouées, comportement identique.

**Verdict : ROUGE (provisoire, à réévaluer).** Le blocage constaté est **réseau (TCP), pas
applicatif** — aucune preuve qu'un scraper tournant sur une infrastructure différente (IP
résidentielle marocaine, VPS marocain) rencontrerait le même mur. Peut être un blocage
géographique/anti-datacenter généralisé de l'hébergeur plutôt qu'une politique kitea.ma
spécifique. **Recommandation avant classification définitive** : retenter le même test minimal
depuis un réseau différent.

---

## 5 — universparadiscount.ma (Beauté)

**a. robots.txt** — 200 OK, auto-généré par PrestaShop. `Disallow` uniquement sur panier/compte/
recherche/tri — rien sur produits/catégories. `Sitemap: 1_index_sitemap.xml` déclaré.

**b. Section promos** — **Pas de page dédiée stable.** Une bannière homepage ("Top Chrono -60%")
pointait vers une URL de catégorie recyclée sans rabais actif au moment du test (*"La promo du
jeudi est finie"*). **Mais** les vrais rabais existent bel et bien, visibles dans le carrousel
homepage :
```html
<span class="regular-price">1 008,00 MAD</span> <span class="price"> 665,28 MAD </span>
```
Stratégie viable : scanner les catégories produit et filtrer côté scraper sur la présence de
`.regular-price`.

**c. Rendu** — Statique, pas de SPA. JSON-LD `schema.org/Product` complet sur les pages produit
(`name`, `sku`, `gtin13`, `brand`, `offers.price`). Images en lazy-load mais `data-src` présent
tel quel dans le HTML brut (récupérable sans JS).

**d. Plateforme** — **PrestaShop** (robots.txt auto-généré, cookies `PrestaShop-...`, chemins
`/modules/...`, URLs `/{catégorie}/{id}-{slug}.html`, JSON-LD natif PrestaShop 1.7/8). Cloudflare
en façade (CDN/WAF, pas de blocage).

**e. Sélecteurs** — Nom/prix promo/sku/marque/image/dispo : tous dans le **JSON-LD** (source la plus
stable). Prix barré uniquement en CSS : `div.product-price.has-discount span.regular-price` (texte
formaté, pas d'attribut numérique séparé).

**f. Anti-bot** — Aucun constaté, 200 OK partout, Cloudflare en façade sans challenge.

**g. Volume** — Non déterminé dans le budget du spike (pas de pagination visible sur la catégorie
testée) — à vérifier via `1_index_sitemap.xml`.

**Verdict : ~~ORANGE~~ → VERT, DÉVELOPPÉ (révisé le 23/07/2026).** Reconstat avec le client réel
du pipeline (Node `fetch`/undici, pas seulement `curl` — leçon mrbricolage) : **200 partout, aucun
blocage Cloudflare**. Le surcoût ORANGE (« pas de page promo stable, volume à chiffrer ») est
**levé** : la **homepage** agrège en une seule requête **94 produits remisés uniques** (cartes
`.js-product-miniature` avec `.regular-price` + `.price`), aucun scan catalogue nécessaire. La
catégorie `/428-les-bons-deals` s'est révélée un leurre (3 deals épinglés répétés à chaque page) —
non retenue. Scraper livré : `apps/pipeline/scraper-universparadiscount.mjs` (homepage-only,
filtre `.regular-price`, rejet des non-remisés). Vérifié en local : 94 offres extraites/insérées en
`auto_draft`, images traitées, dédup OK.

---

## 6 — bricoma.ma et mrbricolage.ma (Bricolage & Jardin)

### bricoma.ma

**a. robots.txt** — 200 OK, Magento standard, aucun Disallow actif sur catégorie/produit.

**b. Section promos** — **Absente** du menu (19 catégories, aucune "promo"). Un widget homepage
("Promotions", carrousel Owl) avec seulement **6 produits**, vrais prix barrés :
```html
<span class="special-price">449,00 MAD</span> <span class="old-price">499,00 MAD</span>
```
`/promotions.html` deviné → 404 (pas de page dédiée à cette URL).

**c. Rendu** — Statique, server-rendered (Magento 2 classique).

**d. Plateforme** — **Magento 2**, thème custom "Elevenmedia/Bricoma" (`X-Magento-Tags`,
`pub/static/version.../frontend/Elevenmedia/Bricoma/...`).

**e. Sélecteurs** — Nom `h1.page-title [itemprop=name]`, prix (`data-price-amount`, fiable, pas de
parsing texte requis) via `.price-box .old-price`/`.special-price`, image `meta[property=og:image]`.

**f. Anti-bot** — Aucun (Apache, pas de Cloudflare, 200 partout).

**g. Volume** — Très faible, ~6 produits, non paginé. Sitemap XML disponible pour un crawl catalogue
complet (surcoût significatif).

**Verdict bricoma.ma : ORANGE.** Techniquement propre, mais volume exploitable quasi nul sans crawl
catalogue complet via sitemap.

### mrbricolage.ma

**a. robots.txt** — 200 OK (Rank Math SEO), `Disallow` uniquement panier/compte/filtres. Note
factuelle : contient une règle explicite `Allow: /` pour `Claude-Web`/`anthropic-ai` — à l'inverse
de marwa.com/iam.ma.

**b. Section promos** — **URL exacte : `https://mrbricolage.ma/boutique/?stock_status=onsale`**
(lien "PROMOTIONS" en menu). Vrais prix WooCommerce standard :
```html
<del><span class="woocommerce-Price-amount amount"><bdi>8990,00 MAD</bdi></span></del>
<ins><span class="woocommerce-Price-amount amount"><bdi>7290,00 MAD</bdi></span></ins>
```

**c. Rendu** — Statique (WordPress classique, Elementor pour la mise en page mais toujours du HTML
server-rendered).

**d. Plateforme** — **WordPress + WooCommerce**, thème Woodmart, page builder Elementor, SEO
Rank Math, plugin multi-magasins.

**e. Sélecteurs** — Nom `h1.product_title`, prix barré `.price del .amount`, prix promo
`.price ins .amount` (attention collision possible avec les blocs "produit précédent/suivant" —
cibler `.wd-single-price`), SKU `.sku_wrapper .sku`, image `meta[property=og:image]`.

**f. Anti-bot** — Cloudflare en façade, `cf-cache-status: HIT`, aucun challenge rencontré sur ce
volume de test **en `curl`**.

**g. Volume** — *"Affichage de 1–12 sur 698 résultats"* — élevé, paginé clairement (~59 pages).

**Verdict mrbricolage.ma : ~~VERT~~ → NON RETENU (révisé le 23/07/2026).** Le contenu et les prix
barrés sont bien server-rendered et lisibles **en `curl`** (200) — mais lors du lot de
développement du scraper (23/07/2026), constat que le **client HTTP de Node (`fetch`/undici) est
hard-bloqué par Cloudflare** : `403 « Attention Required! | Cloudflare — Sorry, you have been
blocked »` (page de blocage dure, pas un challenge JS), de façon déterministe, sur toutes les pages
de contenu (homepage, `/boutique/`, listing promo), alors que `curl` renvoie 200 au même instant,
depuis la même IP, avec le même User-Agent. Discrimination par **empreinte TLS/HTTP** (JA3/JA4) :
Cloudflare bot-management flague la pile `undici`, pas `curl`. Un jeu d'en-têtes navigateur complet
(Accept, Sec-Fetch-*, sec-ch-ua…) ne change rien — c'est bien la couche TLS, pas les en-têtes.

Tension notable : le `robots.txt` de mrbricolage.ma **autorise explicitement** `anthropic-ai`/
`Claude-Web` (`Allow: /`) — la politique de crawl *déclarée* nous permet l'accès, mais la couche
Cloudflare bloque notre client par défaut. Le spike d'origine, mené en `curl`, n'avait pas testé un
client HTTP applicatif (Node) : d'où la révision du verdict.

Décision produit (23/07/2026) : **source abandonnée**, pas développée. La faire fonctionner
imposerait soit un sous-processus `curl` (router autour d'un `403` — écarté comme trop proche du
contournement anti-bot que le pipeline s'interdit), soit une impersonation TLS/navigateur headless
(idem, plus lourd) — deux voies non retenues. Réévaluable si un jour un client HTTP applicatif
passe sans forgerie, ou si le site retire ce filtrage.

**Mutualisation bricoma.ma / mrbricolage.ma : NON** au niveau sélecteurs/parsing (Magento vs
WooCommerce, deux DOM totalement différents) — nécessite deux adaptateurs distincts. Mutualisable
uniquement au niveau architecture générique (fetch + retry/backoff + normalisation prix→nombre),
comme pour Bringo.

---

## 7 — iam.ma, orange.ma, inwi.ma (Téléphonie & Internet)

*Spécificité de la catégorie : forfaits/abonnements, pas des produits physiques — le modèle
prix_normal/prix_promo ne s'applique pas toujours tel quel (bonus data, mois offert, sans prix
barré classique).*

### iam.ma

**a. robots.txt** — 200 OK. `User-agent: *` → `Allow: /`, mais règle nommée identique à marwa.com :
```
User-agent: ClaudeBot
Disallow: /
```
(+ GPTBot, Google-Extended, CCBot, Bytespider, meta-externalagent, Amazonbot, Applebot-Extended.)

**b-g.** **Non évalués**, même traitement que marwa.com — arrêt au constat robots.txt, aucun
contournement sous UA générique.

**Verdict : ROUGE — gouvernance, pas technique.** La requête robots.txt a répondu normalement (200,
pas de mur), donc rien n'indique de blocage technique — c'est une exclusion nommée et délibérée.

### orange.ma

**a. robots.txt** — `https://www.orange.ma/robots.txt` → **404** (fichier absent, page 404 custom
du site) — absence de restriction déclarée.

**b. Section promo** — Pages trouvées : `boutique.orange.ma/offres-mobile` (catalogue forfaits),
`orange.ma/.../Bons-Plans` (orienté recharge/roaming, pas un hub promo général). Prix observés :
simples ("99 Dh", "299 Dh"), **aucun prix barré/ancien prix trouvé** dans le HTML capturé.

**c. Rendu** — `www.orange.ma` (vitrine) : server-rendered classique. `boutique.orange.ma`
(catalogue) : **Next.js**, coquille de page présente mais **aucune donnée structurée de la grille
produits/prix trouvée dans le payload initial** — à confirmer au rendu navigateur (pas fait dans ce
spike, budget de requêtes épuisé).

**d. Plateforme** — `www.orange.ma` : CMS type eZ Publish/Ibexa (cookie `eZSESSID`, Varnish).
`boutique.orange.ma` : Next.js.

**e. Sélecteurs** — Structure de lien `<a href="…/choisir/{slug-avec-prix}">Forfait {nom} {prix}
Dh</a>` en nav/footer ; pas de sélecteur de grille catalogue confirmé.

**f. Anti-bot** — Pas de blocage constaté, mais cookies `TS...` sur tous les domaines → **WAF F5
BIG-IP ASM** (posture de surveillance active, pas de blocage lors des tests).

**g. Volume** — Non confirmé comme représentant la grille réelle de la page catalogue.

**Modèle deal adapté ?** Probablement **non tel quel** — pas de structure de prix barré constatée.

**Verdict : ORANGE.** Grille catalogue clé probablement CSR (à confirmer au rendu navigateur avant
tout engagement), pas de vraie promo à rabais constatée, WAF F5 en vigilance.

### inwi.ma

**a. robots.txt** — 200 OK (après redirect `www.`→apex). `Disallow` uniquement sur tunnel d'achat/
API (`/particuliers/achat/*`, `/api/...`, `/cart/*`) — rien sur le catalogue/promo. Aucun bot IA
nommé.

**b. Section promo — URL exacte : `https://inwi.ma/particuliers/offres-du-moment`.** Vrai modèle
prix barré confirmé, dans le JSON embarqué ET visuellement :
```json
"pricing":{"regularPrice":299,"finalPrice":249,"promo":true,"pricingType":"recurring"}
```
```html
<p class="... line-through" data-testid="Procing-promo"><span dir="ltr">149</span> DH</p>
```

**c. Rendu** — **Exploitable directement malgré Next.js/React** : les données sont déjà présentes
dans le HTML brut sous forme de payload JSON streamé (`self.__next_f.push([...])`) — extraction par
parsing du texte des `<script>`, pas de rendu JS nécessaire.

**d. Plateforme** — Next.js (App Router, React Server Components), monitoring Dynatrace, WAF F5
probable (cookies `TS...`, non bloquant).

**e. Sélecteurs** — Prix barré : `data-testid="Procing-promo"` + classe `line-through`. Structure
JSON directement exploitable : clés `regularPrice`, `finalPrice`, `promo` (bool), `pricingType`.
Nom : clé `title` associée (nécessite de parcourir le JSON, pas un sélecteur DOM simple).

**f. Anti-bot** — Aucun blocage, 200 partout.

**g. Volume** — 25 occurrences `regularPrice` sur cette seule page, dont **10 marquées
`"promo":true`** — ~10 offres actives (smartphones/forfaits/wifi).

**Modèle deal adapté ?** **Oui, directement** — `regularPrice`/`finalPrice`/`promo` sont littéralement
les champs source.

**Verdict : VERT.** Robots.txt permissif, HTML exploitable sans rendu JS, vraie structure de prix
barré confirmée, aucun anti-bot. Seul bémol mineur : parsing JSON embarqué plutôt que DOM simple.

---

## 8 — royalairmaroc.com (Voyages, exploratoire)

**a. robots.txt** — 200 OK, minimal (`Disallow: /web/`, `/int/`) — rien sur les chemins offres
identifiés.

**b. Structure des offres** — Deux surfaces server-rendered avec prix réels :
- Widget homepage "bestOffers" (6 destinations, prix fixe "De X MAD").
- Widget `/fr_ma/` "tendance" (20 cartes route+date+prix, cache de tarifs constatés) :
  ```
  Casablanca CMN à Paris ORY 10/08/2026 - 24/08/2026 De MAD 1 915,38
  ```
**Aucun prix barré/original constaté** — uniquement des tarifs "à partir de X" dynamiques et datés,
pas une logique promo classique.

**c. Rendu** — Exploitable directement, sans JS, sur les deux widgets (confirmé par extraction texte
brut de la réponse curl).

**d. Plateforme** — **Deux systèmes distincts** : pages contenu (`/ma-fr/*`) sur **Liferay Portal**
(Azure Front Door) ; module réservation/prix (`/fr_ma/*`) sur **Next.js/React**, assets
`assets.airtrfx.com` (plateforme SaaS tierce "AirTRFX" mutualisée entre compagnies aériennes),
Cloudflare + AWS API Gateway.

**e.** Structure "destination + prix à partir de X" confirmée à deux endroits, sans recherche
interactive. Le widget `/fr_ma/` ressemble à un cache de "tarifs plancher constatés" (pas des
promotions officielles affichées avec réduction).

**f. Anti-bot** — Aucun constaté (200 partout, Cloudflare en cache HIT sans challenge) — plus ouvert
qu'attendu pour une compagnie aérienne. Réserve : test limité à 1 requête/page, pas de test de
volume/fréquence.

**g. Volume** — 6 destinations (homepage) + 20 cartes route/date/prix (`/fr_ma/`) par chargement.

**Verdict : ORANGE.** Plus ouvert que prévu techniquement, mais le concept de "deal" classique
(prix normal vs promo) est **partiellement inadapté** : pas de prix barré constaté. Un scraper viable
nécessiterait un modèle différent ("tarif plancher constaté par route à date T", comparé dans le
temps par nos propres relevés successifs) plutôt qu'un modèle "prix affiché vs promo affiché".
Surcoût : deux stacks distinctes à gérer (Liferay + Next.js/AirTRFX), stabilité de session non
vérifiée, absence de test de rate-limiting à volume réel.

---

## Tableau comparatif

| Cible | Promo dédiée | Prix barrés réels | Cheerio-compatible | Plateforme | Anti-bot | Volume | Verdict |
|---|---|---|---|---|---|---|---|
| electroplanet.ma | Inconnu | Inconnu | Inconnu | Inconnu | **Cloudflare, domaine entier** | — | **ROUGE** |
| decathlon.ma | Oui (`/5080-promotions`) | Oui | Oui (page catégorie native) | PrestaShop "oneshop" | Détection sans blocage + **bug cache inter-tenant** | ~1580 | **ORANGE** |
| marwa.com | Non évalué | Non évalué | Non évalué | Non évalué | Aucun mur technique constaté | — | **ROUGE** (gouvernance : `Disallow: ClaudeBot`) |
| kitea.ma | Non évalué | Non évalué | Non évalué | Non évalué | **Timeout réseau (ambigu)** | — | **ROUGE** (provisoire, à réévaluer) |
| universparadiscount.ma | Oui (homepage : ~94 remisés uniques) | Oui | Oui (Node fetch OK) | PrestaShop | Aucun (Node fetch 200) | ~94 | ~~ORANGE~~ **VERT — DÉVELOPPÉ** (23/07) |
| bricoma.ma | Non (widget homepage, 6 produits) | Oui | Oui | Magento 2 | Aucun | ~6 (très faible) | **ORANGE** |
| mrbricolage.ma | Oui (`?stock_status=onsale`) | Oui | Oui (en `curl`) | WordPress/WooCommerce | **Cloudflare 403 sur client HTTP Node** (curl OK) | 698 | ~~VERT~~ **NON RETENU** (Node `fetch` bloqué, révisé 23/07) |
| iam.ma | Non évalué | Non évalué | Non évalué | Non évalué | Aucun mur technique constaté | — | **ROUGE** (gouvernance : `Disallow: ClaudeBot`) |
| orange.ma | Ambigu | Non constatés | Ambigu (catalogue probablement CSR) | eZ Publish/Ibexa + Next.js | WAF F5 (vigilance) | Non confirmé | **ORANGE** |
| inwi.ma | Oui (`/particuliers/offres-du-moment`) | Oui (JSON `regularPrice`/`finalPrice`) | Oui (JSON dans HTML brut) | Next.js/RSC | Aucun | ~10 offres actives | **VERT** |
| royalairmaroc.com | Oui (2 widgets) | **Non** (pas de logique promo) | Oui | Liferay + Next.js/AirTRFX | Aucun (exploratoire) | 6 + 20/page | **ORANGE** (modèle deal inadapté) |

---

## Recommandation d'ordre de développement (argumentée)

**Aucune décision d'implémentation n'est prise ici — cette recommandation éclaire, la décision reste
en revue.**

> **Mise à jour du 23/07/2026** : `inwi.ma` développé et intégré au cron (commits `e32b0e5`,
> `205e350`). `mrbricolage.ma`, tenté ensuite, **abandonné** : client HTTP Node hard-bloqué par
> Cloudflare (403 déterministe) alors que `curl` passe — voir section 6 révisée.
> `universparadiscount.ma` développé (Beauté) : verdict ORANGE **levé** au reconstat (Node fetch OK,
> homepage = ~94 remisés en une requête) — voir section 5 révisée. Intégration cron :
> lot séparé à venir.

1. ~~**mrbricolage.ma (VERT)**~~ — **écarté (révisé 23/07/2026)** : contenu lisible en `curl` mais
   Cloudflare bot-management renvoie `403` au client HTTP de Node (empreinte TLS), et le
   contourner (sous-processus curl / impersonation) est exclu par le principe anti-contournement du
   pipeline. Leçon : un verdict de scrapabilité doit tester le **client réellement utilisé en prod**
   (Node `fetch`), pas seulement `curl`.
2. **inwi.ma (VERT)** — seul VERT de la catégorie Téléphonie & Internet (nouvelle catégorie taxonomie
   v2, zéro couverture pipeline actuelle) : page promo dédiée, vraie structure prix barré en JSON
   directement dans le HTML brut, aucun anti-bot. Prioriser tôt car ouvre une catégorie entière sans
   scraper existant, et la technique d'extraction JSON streamé (Next.js RSC) développée ici est
   réutilisable pour retenter orange.ma plus tard (même famille technique, cf. ci-dessous).
3. ~~**universparadiscount.ma (ORANGE)**~~ — **DÉVELOPPÉ (23/07/2026, verdict relevé VERT)** :
   au reconstat, Node fetch passe (200) et la homepage agrège ~94 produits remisés uniques en une
   requête — le surcoût « scan catégorie » du spike était inutile. Scraper livré
   (`scraper-universparadiscount.mjs`). Reste : ajout de l'enseigne `universparadiscount` en prod
   (geste Kamel, `docs/RUNBOOK-donnees.md`) + intégration cron (lot séparé).
4. **decathlon.ma (ORANGE)** — Volume le plus élevé de tout le spike (~1580 produits), mais nécessite
   une garde de validation/retry à cause du bug de cache inter-tenant constaté (partagé avec
   universparadiscount.ma — possible mutualisation de cette garde entre les deux adaptateurs
   PrestaShop, à investiguer si les deux sont développés). Prioriser après (3) une fois la stratégie
   PrestaShop générique rodée.
5. **bricoma.ma (ORANGE)** — technique la plus simple (Magento, `data-price-amount` fiable), mais
   volume quasi nul (~6 produits, non paginé) sans crawl catalogue complet via sitemap — rapport
   effort/valeur peu attractif tant que le crawl catalogue n'est pas justifié par ailleurs.
6. **orange.ma (ORANGE, à lever avant tout engagement)** — la grille catalogue clé (`boutique.orange.
   ma`) n'a pas livré de données prix dans le payload initial ; une vérification au rendu navigateur
   (non faite dans ce spike, hors budget) est un préalable obligatoire avant de statuer si le site
   est réellement développable — pourrait redescendre en VERT ou remonter en ROUGE selon ce constat.
7. **royalairmaroc.com (ORANGE, exploratoire)** — techniquement plus ouvert que redouté, mais le
   modèle de données "deal" ne colle pas : nécessiterait une extension de schéma (tarif observé par
   route/date plutôt que prix_normal/prix_promo) hors périmètre d'un simple nouvel adaptateur.
   À traiter comme un mini-projet à part, pas comme un scraper de plus dans la même série.
8. **kitea.ma (ROUGE provisoire)** — à retester depuis un réseau différent avant classification
   définitive ; ne pas conclure à un blocage volontaire du site sur la seule base de ce spike.
9. **electroplanet.ma, marwa.com, iam.ma (ROUGE)** — non retenus en l'état : le premier pour un mur
   Cloudflare technique appliqué au domaine entier, les deux autres pour une exclusion explicite et
   nommée de Claude dans leur `robots.txt` (question de gouvernance/consentement, pas de faisabilité
   technique — nécessiterait une validation de conformité avant toute reprise).

**Mutualisation par plateforme constatée** :
- PrestaShop (decathlon.ma "oneshop" + universparadiscount.ma) : socle de sélecteurs/JSON-LD
  partiellement réutilisable, mais chaque site garde ses particularités (Alpine.js chez Decathlon,
  bug de cache croisé entre les deux).
- Next.js/RSC (inwi.ma + orange.ma) : technique d'extraction du payload JSON streamé mutualisable,
  sans garantie que orange.ma expose les mêmes données que inwi.ma (à vérifier).
- Magento (bricoma.ma) et WooCommerce (mrbricolage.ma) : **aucune mutualisation possible** entre eux
  malgré la même catégorie cible (Bricolage & Jardin) — deux DOM entièrement différents, deux
  adaptateurs distincts nécessaires. Seule l'architecture générique (fetch/retry/normalisation prix)
  reste commune, comme pour tous les adaptateurs de ce spike.
