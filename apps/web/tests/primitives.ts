import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chip } from "../src/components/Chip.js";
import { Badge } from "../src/components/Badge.js";
import { Input, Textarea } from "../src/components/Input.js";
import { Button } from "../src/components/Button.js";

/**
 * Primitives de charte — rendu et RATTACHEMENT AUX TOKENS COURANTS.
 *
 * CONTRAT-V1 §8, règle 6 : une primitive de charte se conserve même sans
 * appelant, mais doit porter un test la rattachant aux tokens courants. Sans
 * appelant, rien ne la fait plus échouer : elle continue de compiler en
 * référençant des tokens supprimés, et le jour où on la ressort elle rend du
 * vide. C'est le cas de `Chip` depuis le lot 7 (dernier appelant retiré).
 *
 * Le test vérifie les deux sens, et les deux comptent :
 *   1. chaque token attendu EXISTE dans le `@theme` de globals.css — le test
 *      casse si un token disparaît de la palette ;
 *   2. chaque token attendu est RÉELLEMENT référencé par le rendu de la
 *      primitive — le test casse si la primitive s'écarte de la charte.
 *
 * La liste attendue est une DÉCLARATION D'INTENTION, pas un relevé
 * automatique : c'est précisément ce qu'est une charte. La déduire du rendu la
 * rendrait tautologique — elle suivrait la dérive au lieu de la signaler.
 */

const ici = path.dirname(fileURLToPath(import.meta.url));
const GLOBALS = path.resolve(ici, "../src/app/globals.css");

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

/** Tokens de couleur réellement déclarés dans le `@theme` (source de vérité). */
function tokensDeclares(): Set<string> {
  const css = readFileSync(GLOBALS, "utf8");
  const noms = new Set<string>();
  for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) noms.add(m[1]!);
  return noms;
}

/** Le rendu référence-t-il ce token ? `bg-accent-soft`, `hover:text-accent`,
 *  `focus-visible:outline-accent`… — le token est le suffixe de l'utilitaire,
 *  et il ne doit pas être suivi d'un autre segment (sinon `accent` matcherait
 *  dans `accent-soft`). */
function referenceLeToken(markup: string, token: string): boolean {
  return new RegExp(`-${token}(?![a-z0-9-])`).test(markup);
}

interface Primitive {
  nom: string;
  /** Un rendu par ÉTAT : chaque état doit être couvert, pas seulement celui
   *  par défaut — c'est dans les états que vivent la moitié des tokens. */
  etats: Record<string, string>;
  tokens: string[];
  orpheline?: string;
}

const PRIMITIVES: Primitive[] = [
  {
    nom: "Chip",
    etats: {
      inactif: renderToStaticMarkup(createElement(Chip, {}, "Filtre")),
      actif: renderToStaticMarkup(createElement(Chip, { active: true }, "Filtre")),
    },
    // Inactif : surface + border-strong + ink-muted, survol accent-soft/
    // accent-line/accent. Actif : accent-soft cerclé accent. Focus : accent.
    tokens: ["surface", "border-strong", "ink-muted", "accent-soft", "accent-line", "accent"],
    orpheline:
      "plus aucun appelant depuis le lot 7 (les puces de filtre ont laissé place à la colonne latérale et à la feuille)",
  },
  {
    nom: "Badge",
    etats: {
      hot: renderToStaticMarkup(createElement(Badge, { variant: "hot" }, "12")),
      accent: renderToStaticMarkup(createElement(Badge, { variant: "accent" }, "Publié")),
      warn: renderToStaticMarkup(createElement(Badge, { variant: "warn" }, "En attente")),
      cold: renderToStaticMarkup(createElement(Badge, { variant: "cold" }, "Expiré")),
      outline: renderToStaticMarkup(createElement(Badge, { variant: "outline" }, "Brouillon")),
    },
    tokens: [
      "hot-soft", "hot", "hot-line",
      "accent-soft", "accent", "accent-line",
      "warn-soft", "warn", "warn-line",
      "cold-soft", "cold", "cold-line",
      "ink-muted", "border-strong",
    ],
  },
  {
    nom: "Input",
    etats: {
      normal: renderToStaticMarkup(createElement(Input, {})),
      invalide: renderToStaticMarkup(createElement(Input, { invalid: true })),
    },
    tokens: ["surface", "ink", "ink-subtle", "border-strong", "accent", "warn"],
  },
  {
    nom: "Textarea",
    etats: {
      normal: renderToStaticMarkup(createElement(Textarea, {})),
      invalide: renderToStaticMarkup(createElement(Textarea, { invalid: true })),
    },
    tokens: ["surface", "ink", "ink-subtle", "border-strong", "accent", "warn"],
  },
  {
    nom: "Button",
    etats: {
      primary: renderToStaticMarkup(createElement(Button, { variant: "primary" }, "Publier")),
      secondary: renderToStaticMarkup(createElement(Button, { variant: "secondary" }, "Annuler")),
      brand: renderToStaticMarkup(createElement(Button, { variant: "brand" }, "Le concept")),
      ghost: renderToStaticMarkup(createElement(Button, { variant: "ghost" }, "Fermer")),
      danger: renderToStaticMarkup(createElement(Button, { variant: "danger" }, "Supprimer")),
    },
    tokens: [
      "accent", "accent-hi", "accent-soft", "accent-line",
      "surface", "surface-subtle", "ink", "ink-muted", "border-strong",
      "hot", "hot-soft", "hot-line",
    ],
  },
];

const declares = tokensDeclares();

console.log("Primitives de charte — tokens déclarés dans globals.css");
check("le @theme expose bien des tokens de couleur", declares.size > 10);

for (const p of PRIMITIVES) {
  console.log(`\n${p.nom}${p.orpheline ? ` — SANS APPELANT (${p.orpheline})` : ""}`);

  for (const [etat, markup] of Object.entries(p.etats)) {
    check(`${p.nom} — état « ${etat} » rendu`, markup.length > 0 && markup.includes("class="));
  }

  const rendus = Object.values(p.etats).join(" ");
  for (const token of p.tokens) {
    // 1. Le token existe-t-il encore dans la palette ?
    check(`${p.nom} — le token « ${token} » existe dans le @theme`, declares.has(token));
    // 2. La primitive s'en sert-elle toujours ?
    check(`${p.nom} — le rendu référence bien « ${token} »`, referenceLeToken(rendus, token));
  }
}

// Contrôle négatif : sans lui, les vérifications ci-dessus passeraient tout
// aussi bien avec un comparateur cassé.
console.log("\nTémoins");
check("un token inventé n'est PAS déclaré", !declares.has("token-qui-nexiste-pas"));
check(
  "un token inventé n'est PAS référencé",
  !referenceLeToken(Object.values(PRIMITIVES[0]!.etats).join(" "), "token-qui-nexiste-pas")
);
check(
  "« accent » ne matche pas à l'intérieur de « accent-soft »",
  !referenceLeToken('class="bg-accent-soft"', "accent")
);

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
