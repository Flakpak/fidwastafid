// ============================================================
// FIDWASTAFID — Extraction de la description depuis une fiche produit Bringo
//
// Reco du 15/07 validée : le HTML de la fiche est servi statique (pas de
// rendu JS nécessaire, un fetch simple suffit — pas de Playwright ici).
// Le bloc "Détails" se résout via la chaîne #details-tab → attribut
// aria-controls → #{valeur} (onglet Bootstrap classique), avec repli sur
// le premier .nav-link dont le texte est "Détails" si l'id a changé.
//
// JAMAIS bloquant pour l'appelant (insert-deals.mjs / le script de
// rattrapage) : toute erreur retourne null, jamais d'exception qui
// remonte — le deal s'insère quand même, description à null.
// ============================================================

import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const TIMEOUT_MS = 10_000;
const MAX_LONGUEUR = 1000;

// Disclaimer standard Bringo, en fin de bloc — normalement isolé dans un
// <div class="product-details-disclaimer"> dédié (retiré structurellement
// ci-dessous), mais on garde ce filet de sécurité textuel au cas où une
// fiche l'intègre en texte brut plutôt que dans cette div (variantes
// proches : ponctuation/majuscules qui diffèrent légèrement).
const DISCLAIMER_RE =
  /les informations affich[ée]es peuvent [êe]tre incompl[èe]tes ou obsol[èe]tes[\s\S]*$/i;

// Identifiant interne Bringo ("Numéro du produit: 677080") — bruit pour le
// lecteur, retiré comme le disclaimer : structurellement quand il vit dans
// son propre <p>/<li> (cas observé sur toutes les fiches testées), avec un
// filet de sécurité regex sinon.
const NUMERO_PRODUIT_LIGNE_RE = /^num[ée]ro du produit\s*:\s*\d+$/i;
const NUMERO_PRODUIT_FIN_RE = /num[ée]ro du produit\s*:\s*\d+\s*$/i;

/**
 * Reconstruit un texte lisible depuis le bloc "Détails" — insère un retour
 * à la ligne à chaque <br>, et après chaque <p>/<li>/<div> (le HTML Bringo
 * mélange les deux : parfois des <br> à l'intérieur d'un <div>, parfois des
 * champs en <p> séparés — les deux structures doivent produire des lignes
 * séparées). Le disclaimer et le numéro produit sont retirés AVANT
 * l'extraction, structurellement.
 */
function texteLisible($, block) {
  const clone = block.clone();
  clone.find(".product-details-disclaimer").remove();
  clone.find("p, li").each((_, el) => {
    if (NUMERO_PRODUIT_LIGNE_RE.test($(el).text().trim())) $(el).remove();
  });
  clone.find("br").replaceWith("\n");
  clone.find("div, p, li").after("\n");

  const brut = clone.text().replace(DISCLAIMER_RE, "");

  const lignes = brut
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !NUMERO_PRODUIT_LIGNE_RE.test(l));

  return lignes.join("\n");
}

/** Coupe à la dernière phrase si elle tombe raisonnablement près de la limite, sinon au dernier mot complet — jamais en plein milieu d'un mot. */
function tronquer(texte, max = MAX_LONGUEUR) {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max);
  const derPhrase = Math.max(
    coupe.lastIndexOf(". "),
    coupe.lastIndexOf(".\n"),
    coupe.lastIndexOf("!"),
    coupe.lastIndexOf("?")
  );
  if (derPhrase > max * 0.5) return coupe.slice(0, derPhrase + 1).trim();
  const derEspace = coupe.lastIndexOf(" ");
  return (derEspace > 0 ? coupe.slice(0, derEspace) : coupe).trim();
}

/**
 * Extrait la description d'une fiche produit Bringo. Ne lève jamais —
 * retourne null (et logue l'URL + l'étape en échec) sur tout problème :
 * fiche injoignable, timeout, onglet/bloc introuvable, texte vide.
 */
export async function extraireDescription(lienFiche) {
  let res;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      res = await fetch(lienFiche, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error(`  ⚠️  fiche-produit [fetch] ${lienFiche} — ${err.message}`);
    return null;
  }

  if (!res.ok) {
    console.error(`  ⚠️  fiche-produit [HTTP ${res.status}] ${lienFiche}`);
    return null;
  }

  let html;
  try {
    html = await res.text();
  } catch (err) {
    console.error(`  ⚠️  fiche-produit [lecture corps] ${lienFiche} — ${err.message}`);
    return null;
  }

  const $ = cheerio.load(html);

  let tab = $("#details-tab");
  if (tab.length === 0) {
    tab = $(".nav-link")
      .filter((_, el) => $(el).text().trim() === "Détails")
      .first();
  }
  if (tab.length === 0) {
    console.error(`  ⚠️  fiche-produit [onglet Détails introuvable] ${lienFiche}`);
    return null;
  }

  const targetId = tab.attr("aria-controls");
  if (!targetId) {
    console.error(`  ⚠️  fiche-produit [aria-controls absent] ${lienFiche}`);
    return null;
  }

  const block = $(`#${targetId}`);
  if (block.length === 0) {
    console.error(`  ⚠️  fiche-produit [bloc #${targetId} introuvable] ${lienFiche}`);
    return null;
  }

  let texte = texteLisible($, block);
  if (!texte) {
    // Repli : texte aplati (cheerio .text() standard, sans reconstruction
    // des retours à la ligne) si la structure interne n'a rien donné.
    const flatClone = block.clone();
    flatClone.find(".product-details-disclaimer").remove();
    flatClone.find("p, li").each((_, el) => {
      if (NUMERO_PRODUIT_LIGNE_RE.test($(el).text().trim())) $(el).remove();
    });
    texte = flatClone
      .text()
      .replace(DISCLAIMER_RE, "")
      .replace(NUMERO_PRODUIT_FIN_RE, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (!texte) {
    console.error(`  ⚠️  fiche-produit [texte vide après extraction] ${lienFiche}`);
    return null;
  }

  return tronquer(texte);
}
