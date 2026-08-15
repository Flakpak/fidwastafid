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
 *
 * Couvre aussi l'onglet « Lots récents » (lot du 12/08/2026, réintroduit
 * après le revert de l'incident) : `afficherLots()` est déclenché par clic,
 * pas par montage — pas le même motif de bug que la garde anti-redondance
 * ci-dessus (rien ne compare l'état à l'URL ici), mais aucun test ne
 * vérifiait qu'un clic sur cet onglet déclenche bien l'appel réseau
 * correspondant. Même méthode : cassé délibérément puis réparé avant de
 * committer, pour prouver que le test détecte réellement une régression.
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
  if (url.includes("/admin/deals/compte-filtre")) {
    return new Response(JSON.stringify({ total: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.includes("/admin/deals/compte")) {
    return new Response(
      JSON.stringify({
        comptes: { auto_draft: 0, en_attente: 0, publie: 0, rejete: 0, expire: 0 },
        supprimes: 0,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  if (url.includes("/admin/deals/lots")) {
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ data: [], nextCursor: null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

// `next/navigation` simulé — URL vide, comme un premier accès à `/admin`
// sans paramètres : c'est exactement le cas qui a régressé (état initial
// dérivé d'une URL vide, indistinguable de l'URL au moment de l'effet).
//
// Instance UNIQUE, créée une fois hors du hook (pas `() => new
// URLSearchParams("")` inline) : le vrai `useSearchParams()` de Next.js
// renvoie une référence STABLE tant que l'URL ne change pas réellement —
// un mock qui recrée un objet à chaque rendu casse la garde de l'effet
// réactif à `searchParams` (`[searchParams]` en dépendance), qui le
// verrait alors « changé » à chaque re-rendu et écraserait les filtres
// appliqués en repartant de cette URL vide (constaté en écrivant le test
// « filtre appliqué au changement » du 15/08/2026 : les filtres revenaient
// à vide entre deux rendus, sans qu'aucun clic ne l'ait demandé).
const searchParamsVides = new URLSearchParams("");
mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ replace: () => {}, push: () => {} }),
    useSearchParams: () => searchParamsVides,
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

function bouton(texte: string): HTMLButtonElement {
  const boutons = Array.from(document.querySelectorAll("button"));
  const trouve = boutons.find((b) => b.textContent?.trim().startsWith(texte));
  if (!trouve) {
    throw new Error(`Bouton « ${texte} » introuvable — boutons présents : ${boutons.map((b) => b.textContent).join(" | ")}`);
  }
  return trouve as HTMLButtonElement;
}

function cliquer(el: HTMLButtonElement) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

console.log("\nAdminPipeline — bascule vers l'onglet « Lots récents »");
appelsFetch.length = 0;
await act(async () => {
  cliquer(bouton("Lots récents"));
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

check(
  "cliquer « Lots récents » déclenche un appel vers /admin/deals/lots",
  appelsFetch.some((u) => u.includes("/admin/deals/lots") && !u.includes("annuler"))
);

act(() => {
  root.unmount();
});

/**
 * Friction de modération (15/08/2026, 253 deals à trier) : un clic
 * Valider/Rejeter appelait `rafraichir()` — refetch de toute la première
 * page + des compteurs, remplaçant `deals` en entier. La ligne traitée
 * disparaissait bien, mais TOUTES les autres étaient recréées (React perd
 * la position de défilement sur un tableau qui change de référence), et
 * "charger plus" au-delà de la première page était réinitialisé. Corrigé en
 * retirant la ligne localement (`retirerDesListe`) au lieu de tout
 * recharger — ce test échouait avant le correctif (repéré en le committant
 * cassé une fois, même méthode que les sections précédentes).
 */
function dealFixture(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    publicId: overrides.publicId ?? "aaaaaaaaaa",
    titre: "Deal de test",
    categorie: "Autre",
    type: "physique",
    prixPromo: 100,
    statut: "en_attente",
    score: 0,
    submitterPublicId: null,
    submitterPseudo: null,
    submitterCouleurAvatar: null,
    commentairesCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    whatsappContact: null,
    whatsappPublic: false,
    motifRejet: null,
    turnstileVerifie: true,
    diffuseTelegram: false,
    diffuseDiscord: false,
    supprimeLe: null,
    imagePurgeeLe: null,
    doublon: null,
    ...overrides,
  };
}

function reponseJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

console.log("\nAdminPipeline — Valider une ligne : retrait local, pas de refetch de la liste");
{
  const dealA = dealFixture({ publicId: "aaaaaaaaaa", titre: "Premier deal en attente" });
  const dealB = dealFixture({ publicId: "bbbbbbbbbb", titre: "Second deal en attente" });
  let appels: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    appels.push(`${method} ${url}`);
    if (url.includes("/admin/deals/compte-filtre")) return reponseJson({ total: 2 });
    if (url.includes("/admin/deals/compte")) {
      return reponseJson({ comptes: { auto_draft: 0, en_attente: 2, publie: 0, rejete: 0, expire: 0 }, supprimes: 0 });
    }
    if (method === "PATCH" && url.includes("/admin/deals/aaaaaaaaaa")) return reponseJson({});
    if (url.includes("/admin/deals?")) return reponseJson({ data: [dealA, dealB], nextCursor: null });
    return reponseJson({ data: [], nextCursor: null });
  }) as typeof fetch;

  const div = document.createElement("div");
  document.body.appendChild(div);
  const root2 = createRoot(div);
  await act(async () => {
    root2.render(createElement(AdminPipeline, { enseignes: [] }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  check("les deux deals sont montés dans le DOM", document.body.textContent?.includes("Premier deal en attente") === true);
  check("le badge « En attente » affiche (2)", bouton("En attente").textContent?.includes("(2)") === true);

  appels = [];
  const boutonsValider = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "Valider");
  check("exactement deux boutons « Valider » (un par ligne)", boutonsValider.length === 2);
  await act(async () => {
    cliquer(boutonsValider[0] as HTMLButtonElement);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  check(
    "l'action envoie bien le PATCH vers le deal traité",
    appels.some((a) => a.startsWith("PATCH") && a.includes("/admin/deals/aaaaaaaaaa"))
  );
  check(
    "AUCUN refetch de la liste après l'action (régression du 15/08/2026)",
    !appels.some((a) => a.startsWith("GET") && a.includes("/admin/deals?") && a.includes("statut="))
  );
  check(
    "AUCUN refetch des compteurs après l'action (mis à jour localement)",
    !appels.some((a) => a.includes("/admin/deals/compte") && !a.includes("compte-filtre"))
  );
  check("la ligne validée disparaît du DOM", document.body.textContent?.includes("Premier deal en attente") === false);
  check("l'autre ligne reste affichée (pas un remplacement de toute la liste)", document.body.textContent?.includes("Second deal en attente") === true);
  check("le badge « En attente » passe à (1) sans rechargement de page", bouton("En attente").textContent?.includes("(1)") === true);

  act(() => {
    root2.unmount();
  });
  document.body.removeChild(div);
}

console.log("\nAdminPipeline — rejet en masse (sélection multiple) : retrait local des lignes réellement traitées");
{
  const dealA = dealFixture({ publicId: "cccccccccc", titre: "Troisième deal en attente" });
  const dealB = dealFixture({ publicId: "dddddddddd", titre: "Quatrième deal en attente" });
  let appels: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    appels.push(`${method} ${url}`);
    if (url.includes("/admin/deals/compte-filtre")) return reponseJson({ total: 2 });
    if (url.includes("/admin/deals/compte")) {
      return reponseJson({ comptes: { auto_draft: 0, en_attente: 2, publie: 0, rejete: 0, expire: 0 }, supprimes: 0 });
    }
    // Le serveur ignore silencieusement tout id périmé (route bulk) — ici
    // les deux id demandés sont réellement appliqués, `updated` les reflète.
    if (method === "POST" && url.includes("/admin/deals/bulk")) return reponseJson({ updated: ["cccccccccc", "dddddddddd"], lot: "lot-test" });
    if (url.includes("/admin/deals?")) return reponseJson({ data: [dealA, dealB], nextCursor: null });
    return reponseJson({ data: [], nextCursor: null });
  }) as typeof fetch;

  const div = document.createElement("div");
  document.body.appendChild(div);
  const root3 = createRoot(div);
  await act(async () => {
    root3.render(createElement(AdminPipeline, { enseignes: [] }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  // Cases de sélection de LIGNE (dans <ul>, une par deal), distinctes de la
  // case « Tout sélectionner (visible) » (dans l'en-tête, hors <ul> — lot du
  // 15/08/2026) et de celle de `whatsappPublic` dans le panneau <details>
  // "Éditer le deal" (repliée mais toujours dans le DOM jsdom, seul
  // l'affichage CSS change).
  const casesLigne = Array.from(document.querySelectorAll('ul input[type="checkbox"]')).filter(
    (c) => !c.closest("details")
  );
  check("deux cases à cocher (sélection multiple, onglet En attente)", casesLigne.length === 2);
  // `.click()` (pas un `change` synthétique) : jsdom applique lui-même
  // l'algorithme natif — bascule `checked` PUIS émet `click`/`input`/`change`,
  // exactement ce que `onChange={onToggle}` attend d'un vrai clic utilisateur.
  await act(async () => {
    for (const c of casesLigne) (c as HTMLInputElement).click();
  });

  appels = [];
  const validerSelection = bouton("Valider la sélection");
  await act(async () => {
    cliquer(validerSelection);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  check("l'action groupée envoie bien POST /admin/deals/bulk", appels.some((a) => a.startsWith("POST") && a.includes("/admin/deals/bulk")));
  check(
    "AUCUN refetch de la liste après l'action groupée (régression du 15/08/2026)",
    !appels.some((a) => a.startsWith("GET") && a.includes("/admin/deals?") && a.includes("statut="))
  );
  check("les deux lignes traitées disparaissent du DOM", document.body.textContent?.includes("Troisième deal en attente") === false && document.body.textContent?.includes("Quatrième deal en attente") === false);
  check("le badge « En attente » passe à (0)", bouton("En attente").textContent?.includes("(0)") === true);

  act(() => {
    root3.unmount();
  });
  document.body.removeChild(div);
}

/**
 * « Tout sélectionner », niveau 1 (lot du 15/08/2026) — la case d'en-tête
 * coche/décoche TOUT ce qui est CHARGÉ, jamais plus : périmètre vérifié
 * explicitement (le corps envoyé au serveur ne porte QUE les deux id
 * chargés, jamais un troisième deviné ou un filtre).
 */
console.log("\nAdminPipeline — « Tout sélectionner (visible) » : périmètre et bascule");
{
  const dealA = dealFixture({ publicId: "eeeeeeeeee", titre: "Cinquième deal en attente" });
  const dealB = dealFixture({ publicId: "ffffffffff", titre: "Sixième deal en attente" });
  let corpsBulk: unknown = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.includes("/admin/deals/compte-filtre")) return reponseJson({ total: 2 });
    if (url.includes("/admin/deals/compte")) {
      return reponseJson({ comptes: { auto_draft: 0, en_attente: 2, publie: 0, rejete: 0, expire: 0 }, supprimes: 0 });
    }
    if (method === "POST" && url.includes("/admin/deals/bulk")) {
      corpsBulk = init?.body ? JSON.parse(init.body as string) : null;
      return reponseJson({ updated: ["eeeeeeeeee", "ffffffffff"], lot: "lot-test-2" });
    }
    if (url.includes("/admin/deals?")) return reponseJson({ data: [dealA, dealB], nextCursor: null });
    return reponseJson({ data: [], nextCursor: null });
  }) as typeof fetch;

  const div = document.createElement("div");
  document.body.appendChild(div);
  const root4 = createRoot(div);
  await act(async () => {
    root4.render(createElement(AdminPipeline, { enseignes: [] }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  const toutSelectionner = Array.from(document.querySelectorAll('input[type="checkbox"]')).find((c) =>
    c.closest("label")?.textContent?.includes("Tout sélectionner (visible)")
  ) as HTMLInputElement | undefined;
  if (!toutSelectionner) throw new Error("Case « Tout sélectionner (visible) » introuvable.");
  check(
    "le libellé annonce le compte CHARGÉ, pas le total filtré",
    toutSelectionner.closest("label")?.textContent?.includes("— 2") === true
  );

  const casesLigne = () =>
    Array.from(document.querySelectorAll('ul input[type="checkbox"]')).filter(
      (c) => !c.closest("details")
    ) as HTMLInputElement[];

  await act(async () => {
    toutSelectionner.click();
  });
  check("coche l'en-tête sélectionne les DEUX lignes chargées", casesLigne().every((c) => c.checked));

  await act(async () => {
    toutSelectionner.click();
  });
  check("recocher l'en-tête décoche tout (bascule, pas une union)", casesLigne().every((c) => !c.checked));

  await act(async () => {
    toutSelectionner.click();
  });
  await act(async () => {
    cliquer(bouton("Valider la sélection"));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  check(
    "la sélection totale envoie EXACTEMENT les deux id chargés, rien d'autre",
    Array.isArray((corpsBulk as { publicIds?: unknown })?.publicIds) &&
      (corpsBulk as { publicIds: string[] }).publicIds.length === 2 &&
      (corpsBulk as { publicIds: string[] }).publicIds.includes("eeeeeeeeee") &&
      (corpsBulk as { publicIds: string[] }).publicIds.includes("ffffffffff")
  );

  act(() => {
    root4.unmount();
  });
  document.body.removeChild(div);
}

/**
 * Friction 1 (15/08/2026) — le filtre exigeait un clic « Appliquer » alors
 * que le tri s'appliquait déjà au changement. Corrigé : les filtres à
 * sélection fermée (menu, date) s'appliquent AU CHANGEMENT, sans bouton, et
 * la liste précédemment affichée reste visible pendant le chargement de la
 * suivante — plus de « Chargement… » qui efface tout à chaque changement.
 */
console.log("\nAdminPipeline — filtre appliqué au changement, sans clic « Appliquer », sans reload brutal");
{
  const dealA = dealFixture({ publicId: "gggggggggg", titre: "Septième deal en attente" });
  const dealB = dealFixture({ publicId: "hhhhhhhhhh", titre: "Huitième deal en attente" });
  const dealFiltre = dealFixture({ publicId: "iiiiiiiiii", titre: "Neuvième deal filtré" });

  let resoudreAppelFiltre: (() => void) | null = null;
  const appelsListe: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/admin/deals/compte-filtre")) return reponseJson({ total: 2 });
    if (url.includes("/admin/deals/compte")) {
      return reponseJson({ comptes: { auto_draft: 0, en_attente: 2, publie: 0, rejete: 0, expire: 0 }, supprimes: 0 });
    }
    if (url.includes("/admin/deals?") && url.includes("statut=")) {
      appelsListe.push(url);
      if (url.includes("categorie=")) {
        // Requête tenue EN SUSPENS pour observer le DOM pendant qu'elle vole
        // — c'est exactement le moment où l'ancien code effaçait tout.
        await new Promise<void>((resolve) => {
          resoudreAppelFiltre = resolve;
        });
        return reponseJson({ data: [dealFiltre], nextCursor: null });
      }
      return reponseJson({ data: [dealA, dealB], nextCursor: null });
    }
    return reponseJson({ data: [], nextCursor: null });
  }) as typeof fetch;

  const div = document.createElement("div");
  document.body.appendChild(div);
  const root5 = createRoot(div);
  await act(async () => {
    root5.render(createElement(AdminPipeline, { enseignes: [] }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  check("les deux deals initiaux sont affichés", document.body.textContent?.includes("Septième deal en attente") === true);

  const boutons = Array.from(document.querySelectorAll("button")).map((b) => b.textContent?.trim() ?? "");
  check("aucun bouton « Appliquer les filtres » n'existe plus", !boutons.some((t) => t.startsWith("Appliquer")));

  const selectCategorie = Array.from(document.querySelectorAll("select")).find((s) =>
    s.closest("label")?.textContent?.includes("Catégorie")
  ) as HTMLSelectElement | undefined;
  if (!selectCategorie) throw new Error("Select « Catégorie » introuvable.");

  await act(async () => {
    selectCategorie.value = "Mode";
    selectCategorie.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  check(
    "le changement de filtre part SANS clic — une requête liste porte le filtre",
    appelsListe.some((u) => u.includes("categorie="))
  );
  check(
    "PENDANT la requête, l'ancienne liste reste affichée (pas de reload brutal)",
    document.body.textContent?.includes("Septième deal en attente") === true
  );

  await act(async () => {
    resoudreAppelFiltre?.();
    await new Promise((r) => setTimeout(r, 0));
  });

  check(
    "une fois la réponse arrivée, la nouvelle liste remplace l'ancienne",
    document.body.textContent?.includes("Neuvième deal filtré") === true &&
      document.body.textContent?.includes("Septième deal en attente") === false
  );

  act(() => {
    root5.unmount();
  });
  document.body.removeChild(div);
}

/**
 * Friction 2 (15/08/2026) — « Rejeter tout le résultat filtré » (niveau 2)
 * rafraîchissait toute la liste (retour page 1, « Charger plus »
 * réinitialisé), défaut déjà corrigé pour la sélection manuelle (#141) mais
 * resté sur ce chemin. Corrigé : retrait LOCAL comme la sélection manuelle.
 * `touched` peut dépasser ce qui est chargé à l'écran (ici 2 id touchés,
 * 1 seul réellement affiché) — les compteurs doivent refléter les DEUX,
 * jamais seulement ce qui était visible.
 */
console.log("\nAdminPipeline — rejet du résultat filtré (niveau 2) : retrait local, aucun reload");
{
  const dealVisible = dealFixture({ publicId: "jjjjjjjjjj", titre: "Dixième deal visible" });
  let corpsBulkFiltre: unknown = null;
  let appelsListeApresMontage = 0;
  let montageTermine = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.includes("/admin/deals/compte-filtre")) return reponseJson({ total: 2 });
    if (url.includes("/admin/deals/compte")) {
      return reponseJson({ comptes: { auto_draft: 0, en_attente: 2, publie: 0, rejete: 0, expire: 0 }, supprimes: 0 });
    }
    // `bulk-filtre` vérifié AVANT `bulk` seul (préfixe partagé).
    if (method === "POST" && url.includes("/admin/deals/bulk-filtre")) {
      corpsBulkFiltre = init?.body ? JSON.parse(init.body as string) : null;
      // Deux lignes touchées côté serveur, une seule jamais chargée à
      // l'écran — c'est précisément le cas que ce test couvre.
      return reponseJson({ updated: ["jjjjjjjjjj", "kkkkkkkkkk"], lot: "lot-filtre-test", touched: 2 });
    }
    if (url.includes("/admin/deals?") && url.includes("statut=")) {
      if (montageTermine) appelsListeApresMontage++;
      return reponseJson({ data: [dealVisible], nextCursor: null });
    }
    return reponseJson({ data: [], nextCursor: null });
  }) as typeof fetch;

  const div = document.createElement("div");
  document.body.appendChild(div);
  const root6 = createRoot(div);
  await act(async () => {
    root6.render(createElement(AdminPipeline, { enseignes: [] }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  montageTermine = true;

  const rejeterTout = bouton("Rejeter tout");
  await act(async () => {
    cliquer(rejeterTout);
  });
  // Motif requis pour rejeter — raccourci préenregistré (MotifRejet.tsx).
  await act(async () => {
    cliquer(bouton("Doublon"));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  check(
    "bulk-filtre appelé avec le motif choisi",
    (corpsBulkFiltre as { motifRejet?: string } | null)?.motifRejet === "Doublon"
  );
  check("AUCUN rechargement de la liste après l'action filtrée (friction corrigée le 15/08/2026)", appelsListeApresMontage === 0);
  check("la ligne visible traitée disparaît du DOM", document.body.textContent?.includes("Dixième deal visible") === false);
  check(
    "le badge « En attente » reflète les DEUX lignes touchées, pas seulement la visible",
    bouton("En attente").textContent?.includes("(0)") === true
  );
  check(
    "le bloc « Traiter TOUT le résultat filtré » disparaît (compteFiltre retombé à 0)",
    document.body.textContent?.includes("Traiter TOUT le résultat filtré") === false
  );

  act(() => {
    root6.unmount();
  });
  document.body.removeChild(div);
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
