import { JSDOM } from "jsdom";

/**
 * `AdminPipeline` charge la liste (`GET /api/v1/admin/deals?...`) au
 * montage, et à chaque changement d'onglet cliqué — sans garde qui puisse,
 * comme lors de l'incident du 12/08/2026 (lot filtres/tri, reverté), rester
 * trivialement vraie et bloquer la page sur « Chargement… » indéfiniment.
 * Aucun test ne montait ce composant dans un DOM réel avant cet incident.
 *
 * Sur CETTE branche (issue de `main` après revert), `AdminPipeline` est la
 * version simple d'avant le lot filtres/tri : un seul onglet initial fixe
 * (`en_attente`), pas d'état dérivé de l'URL, pas de `next/navigation`. Les
 * onglets Pipeline/En attente/Publiés/Rejetés/Expirés/Supprimés sont tous
 * des ÉTATS internes de CE SEUL composant (changerOnglet), pas des pages ni
 * des routes séparées — il n'y a donc pas six composants à monter, mais un
 * seul, sous trois angles : le montage initial, et deux bascules d'onglet.
 *
 * « Lots récents » (demandé par ailleurs) N'EXISTE PAS sur cette branche —
 * ce n'était qu'un onglet du lot filtres/rejet-en-masse/annulation-de-lot,
 * entièrement reverté avec le reste de l'incident. Rien ici ne le teste ;
 * un test pour cet onglet devra naître EN MÊME TEMPS que sa réintroduction
 * (même discipline que ce test-ci pour PR #118), pas avant.
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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
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

const { createRoot } = await import("react-dom/client");
const { createElement, act } = await import("react");
const { AdminPipeline } = await import("../src/app/admin/AdminPipeline.js");

const racine = document.getElementById("racine")!;
const root = createRoot(racine);

async function laisserRetomberLesPromesses() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function bouton(texte: string): HTMLButtonElement {
  const boutons = Array.from(document.querySelectorAll("button"));
  const trouve = boutons.find((b) => b.textContent?.trim().startsWith(texte));
  if (!trouve) throw new Error(`Bouton « ${texte} » introuvable — boutons présents : ${boutons.map((b) => b.textContent).join(" | ")}`);
  return trouve as HTMLButtonElement;
}

function cliquer(el: HTMLButtonElement) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

console.log("AdminPipeline — montage initial (« En attente », file de validation par défaut)");

await act(async () => {
  root.render(createElement(AdminPipeline, { enseignes: [] }));
});
await laisserRetomberLesPromesses();

check("un appel réseau part au montage", appelsFetch.length > 0);
check(
  "l'appel vers la LISTE « En attente » (statut=en_attente) part au montage",
  appelsFetch.some((u) => u.includes("/admin/deals?statut=en_attente"))
);
check(
  "l'appel vers le COMPTEUR part aussi au montage",
  appelsFetch.some((u) => u.includes("/admin/deals/compte"))
);

console.log("\nAdminPipeline — bascule vers l'onglet « Pipeline » (auto_draft)");
appelsFetch.length = 0;
await act(async () => {
  cliquer(bouton("Pipeline"));
});
await laisserRetomberLesPromesses();

check(
  "cliquer « Pipeline » déclenche un appel vers statut=auto_draft",
  appelsFetch.some((u) => u.includes("/admin/deals?statut=auto_draft"))
);

console.log("\nAdminPipeline — bascule vers l'onglet « Supprimés »");
appelsFetch.length = 0;
await act(async () => {
  cliquer(bouton("Supprimés"));
});
await laisserRetomberLesPromesses();

check(
  "cliquer « Supprimés » déclenche un appel vers supprime=true",
  appelsFetch.some((u) => u.includes("/admin/deals?supprime=true"))
);

act(() => {
  root.unmount();
});

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
