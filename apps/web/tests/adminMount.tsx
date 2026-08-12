import { mock } from "node:test";
import { JSDOM } from "jsdom";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/**
 * Le montage de `AdminPipeline` doit TOUJOURS déclencher un chargement de la
 * liste (`GET /api/v1/admin/deals?...`) — quoi qu'il arrive, indépendamment
 * de l'URL au moment du montage. Aucun test ne couvrait ce cas avant
 * l'incident du 12/08/2026 : la garde anti-redondance de l'effet réactif à
 * `searchParams` (survie au retour arrière navigateur) était trivialement
 * vraie au tout premier rendu — l'état initial et l'URL au montage
 * dérivaient des mêmes fonctions — et `fetchOnglet` n'était donc jamais
 * appelée. La page restait bloquée sur « Chargement… » indéfiniment en
 * production, jamais reproduit en local faute de compte admin de test.
 *
 * Ce test monte le composant dans un DOM réel (jsdom — `react-dom/client`,
 * pas `renderToStaticMarkup` : les effets ne s'exécutent qu'après montage
 * dans un vrai DOM, jamais côté rendu serveur), avec `next/navigation`
 * simulé (URL vide, comme un premier accès à `/admin`), et vérifie qu'un
 * appel réseau vers la liste part bien au montage — pas seulement vers le
 * compteur.
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

// jsdom AVANT tout import de react-dom/client : React sonde `document` au
// chargement du module, pas seulement à l'appel de createRoot().
const dom = new JSDOM("<!doctype html><html><body><div id='racine'></div></body></html>");
const { window } = dom;
globalThis.window = window as unknown as typeof globalThis.window;
globalThis.document = window.document;
// Node expose déjà un `navigator` natif en lecture seule (Node 21+) — celui
// de jsdom doit le remplacer, pas s'y ajouter.
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.customElements = window.customElements;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const appelsFetch: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  appelsFetch.push(url);
  if (url.includes("/admin/deals/compte")) {
    return new Response(
      JSON.stringify({
        comptes: { auto_draft: 0, en_attente: 0, publie: 0, rejete: 0, expire: 0 },
        supprimes: 0,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return new Response(JSON.stringify({ data: [], nextCursor: null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

// `next/navigation` simulé — URL vide, comme un premier accès à `/admin`
// sans paramètres : c'est exactement le cas qui a régressé (état initial
// dérivé d'une URL vide, indistinguable de l'URL au moment de l'effet).
mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ replace: () => {}, push: () => {} }),
    useSearchParams: () => new URLSearchParams(""),
  },
});

const { createRoot } = await import("react-dom/client");
const { createElement } = await import("react");
const { act } = await import("react");
const { AdminPipeline } = await import("../src/app/admin/AdminPipeline.js");

console.log("Montage de AdminPipeline — cas initial de la garde anti-redondance");

const racine = document.getElementById("racine")!;
const root = createRoot(racine);

await act(async () => {
  root.render(createElement(AdminPipeline, { enseignes: [] }));
});
// Laisse les promesses de fetch (microtasks) se résoudre avant d'inspecter.
await act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

check("un appel réseau part au montage", appelsFetch.length > 0);
check(
  "l'appel vers la LISTE (/admin/deals?statut=...) part au montage — pas seulement le compteur",
  appelsFetch.some((u) => u.includes("/admin/deals?") && u.includes("statut="))
);
check(
  "l'appel vers le COMPTEUR part aussi au montage (effet séparé, inchangé)",
  appelsFetch.some((u) => u.includes("/admin/deals/compte"))
);

act(() => {
  root.unmount();
});

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
