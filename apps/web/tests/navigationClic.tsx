import { JSDOM } from "jsdom";

/**
 * Navigation par catégorie (lot SEO-3b, correctif) — test CLIENT : monté
 * dans un DOM réel (jsdom + react-dom/client, comme tests/adminMount.tsx).
 * Le href rendu est propre ; un clic depuis `?tri=recent` doit pourtant
 * arriver sur la nouvelle catégorie AVEC tri=recent.
 */

// jsdom AVANT tout import de react-dom/client : React sonde `document` au
// chargement du module.
const dom = new JSDOM("<!doctype html><html><body><div id='racine'></div></body></html>", {
  url: "https://fidwastafid.com/categorie/electromenager?tri=recent",
});
const { window } = dom;
globalThis.window = window as unknown as typeof globalThis.window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
// next/link (préchargement à la visibilité) lit `self` et IntersectionObserver.
(globalThis as unknown as { self: unknown }).self = window;
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ColonneFiltres } = await import("../src/app/ColonneFiltres.js");
const { navigationFiltre } = await import("../src/components/LienFiltre.js");
const { FILTRES_PAR_DEFAUT } = await import("../src/lib/filtresFeed.js");

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

const arrivees: string[] = [];
navigationFiltre.vers = (url: string) => {
  arrivees.push(url);
};

function clic(el: Element, init: MouseEventInit = {}) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
}

const racine = createRoot(document.getElementById("racine")!);
const noop = () => {};

async function monter(tri: "recent" | "tendance") {
  await act(async () => {
    racine.render(
      <ColonneFiltres
        filtres={{ ...FILTRES_PAR_DEFAUT, categorie: "Électroménager", tri }}
        liensCategories={[
          { categorie: "Maison", slug: "maison" },
          { categorie: "Électroménager", slug: "electromenager" },
        ]}
        lienEvenement={null}
        nbActifs={0}
        onChange={noop}
        onReinitialiser={noop}
      />
    );
  });
}

console.log("Clic sur une autre catégorie depuis /categorie/electromenager?tri=recent");
{
  await monter("recent");
  const lienMaison = document.querySelector('a[href="/categorie/maison"]');
  check("le lien rendu est propre (href sans paramètre)", lienMaison !== null);
  clic(lienMaison!);
  check("l'URL d'arrivée garde tri=recent", arrivees.at(-1) === "/categorie/maison?tri=recent");

  const lienTout = document.querySelector('a[href="/"]');
  clic(lienTout!);
  check("« Toutes les catégories » → /?tri=recent au clic", arrivees.at(-1) === "/?tri=recent");

  const avant = arrivees.length;
  clic(lienMaison!, { ctrlKey: true });
  check("clic modifié (nouvel onglet) non intercepté : page propre", arrivees.length === avant);
}

console.log("Clic sans choix actif");
{
  await monter("tendance");
  const avant = arrivees.length;
  const lienMaison = document.querySelector('a[href="/categorie/maison"]');
  clic(lienMaison!);
  check("aucun choix actif : pas d'interception (navigation normale du lien)", arrivees.length === avant);
}

await act(async () => racine.unmount());
console.log(`\n${pass} passés, ${fail} échoués`);
process.exit(fail > 0 ? 1 : 0);
