import { renderToStaticMarkup } from "react-dom/server";
import { ColonneFiltres } from "../src/app/ColonneFiltres.js";
import { FILTRES_PAR_DEFAUT, cibleNavigationFiltre, type EtatFiltres } from "../src/lib/filtresFeed.js";
import { canonicalCategorie, hubParSlug } from "../src/lib/hubs.js";

/**
 * Navigation par catégorie (lot SEO-3b) — HTML SERVEUR du filtre, rendu hors
 * navigateur (`renderToStaticMarkup`, comme tests/primitives.ts) : ce que
 * Google reçoit avant toute hydratation. Correctif : aucun href interne ne
 * porte de paramètre ; les choix actifs ne suivent qu'au clic (côté client,
 * tests/navigationClic.tsx).
 */

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  ok  - ${label}`);
  } else {
    fail++;
    console.log(`FAIL  - ${label}`);
  }
}

const noop = () => {};
const LIENS = [
  { categorie: "Maison", slug: "maison" },
  { categorie: "Électroménager", slug: "electromenager" },
];

function rendre(filtres: EtatFiltres, lienEvenement: { href: string; libelle: string } | null = null): string {
  return renderToStaticMarkup(
    <ColonneFiltres
      filtres={filtres}
      liensCategories={LIENS}
      lienEvenement={lienEvenement}
      nbActifs={0}
      onChange={noop}
      onReinitialiser={noop}
    />
  );
}

function hrefsInternes(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? "").filter((h) => h.startsWith("/"));
}

console.log("Filtre — accueil (HTML serveur)");
{
  const html = rendre(FILTRES_PAR_DEFAUT);
  check("lien <a> vers /categorie/electromenager", html.includes('href="/categorie/electromenager"'));
  check("lien <a> vers /categorie/maison", html.includes('href="/categorie/maison"'));
  check("« Toutes les catégories » est un lien vers /", /<a[^>]*href="\/"[^>]*>Toutes les catégories<\/a>/.test(html));
  check("catégorie absente de la liste serveur (0 deal) → aucun lien", !html.includes('href="/categorie/gaming"'));
  check("plus aucun bouton de catégorie", !/<button[^>]*>Maison<\/button>/.test(html));
  check("aucune catégorie active sur l'accueil", !html.includes('aria-current="page"'));
  check("pas d'entrée Black Friday hors fenêtre", !html.includes("/bons-plans/black-friday"));
}

console.log("Filtre — accueil pendant la fenêtre Black Friday");
{
  const html = rendre(FILTRES_PAR_DEFAUT, { href: "/bons-plans/black-friday", libelle: "Black Friday" });
  check("entrée Black Friday = lien, même liste que les catégories", /<a[^>]*href="\/bons-plans\/black-friday"[^>]*>Black Friday<\/a>/.test(html));
}

console.log("Filtre — page catégorie avec ?tri=recent (+ ville, recherche) : aucun href interne avec paramètre");
{
  const filtres: EtatFiltres = { ...FILTRES_PAR_DEFAUT, categorie: "Électroménager", tri: "recent", ville: "Rabat", q: "four" };
  const html = rendre(filtres, { href: "/bons-plans/black-friday", libelle: "Black Friday" });
  const internes = hrefsInternes(html);
  check("des liens internes sont bien rendus", internes.length >= 4);
  check("aucun href interne ne contient « ? »", internes.every((h) => !h.includes("?")));
  // Ordre des attributs non garanti : on isole la balise <a> concernée.
  const baliseActive = html.match(/<a[^>]*href="\/categorie\/electromenager"[^>]*>/)?.[0] ?? "";
  check("catégorie courante à l'état actif (aria-current)", baliseActive.includes('aria-current="page"'));
  check("catégorie courante avec la classe active du filtre", baliseActive.includes("bg-accent-soft text-accent border border-accent"));
  const baliseMaison = html.match(/<a[^>]*href="\/categorie\/maison"[^>]*>/)?.[0] ?? "";
  check("une autre catégorie n'est pas active", baliseMaison !== "" && !baliseMaison.includes("aria-current"));
  check("« Toutes les catégories » → / sans paramètre", /<a[^>]*href="\/"[^>]*>Toutes les catégories<\/a>/.test(html));
}

console.log("Cible du clic et canonical");
{
  check(
    "cible du clic : chemin propre + choix actifs, jamais la catégorie",
    cibleNavigationFiltre("/categorie/maison", { ...FILTRES_PAR_DEFAUT, categorie: "Mode", ville: "Rabat", q: "four" }) ===
      "/categorie/maison?ville=Rabat&q=four"
  );
  check("sans choix actif, la cible est le chemin propre", cibleNavigationFiltre("/", FILTRES_PAR_DEFAUT) === "/");
  check("canonical de la page catégorie sans paramètre", canonicalCategorie(hubParSlug("electromenager")!) === "/categorie/electromenager");
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
