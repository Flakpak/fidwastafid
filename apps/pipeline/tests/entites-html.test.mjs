import { decoderEntitesHtml } from "../entites-html.mjs";

/**
 * Tests unitaires — offline (job CI "quality"). Entités réellement
 * rencontrées en base (`&rsquo;`, `&#038;`) et celles que les API
 * WooCommerce émettent couramment (`&#8211;`, `&amp;`, `&eacute;`, `&#39;`).
 */

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  ok  - ${label}`);
  } else {
    fail++;
    console.log(`FAIL  - ${label}`);
  }
}

console.log("decoderEntitesHtml — entités nommées et numériques");
{
  check("&rsquo; → ’", decoderEntitesHtml("SET D&rsquo;OUTILS") === "SET D’OUTILS");
  check("&#8211; → –", decoderEntitesHtml("A &#8211; B") === "A – B");
  check("&amp; → &", decoderEntitesHtml("SPIC &amp; BAYN") === "SPIC & BAYN");
  check("&#038; → & (forme réelle WooCommerce)", decoderEntitesHtml("SPIC &#038; BAYN") === "SPIC & BAYN");
  check("&eacute; → é", decoderEntitesHtml("Pi&eacute;ces") === "Piéces");
  check("&#39; → '", decoderEntitesHtml("l&#39;eau") === "l'eau");
}

console.log("decoderEntitesHtml — titre sans entité inchangé");
{
  const titre = "VELO D'APPARTEMENT 81*40*113CM — Électroménager & co";
  check("identique octet pour octet", decoderEntitesHtml(titre) === titre);
}

console.log("decoderEntitesHtml — pas de repli silencieux");
{
  let erreur = null;
  try {
    decoderEntitesHtml(undefined);
  } catch (e) {
    erreur = e;
  }
  check("une entrée non chaîne lève une TypeError", erreur instanceof TypeError);
}

console.log(`\n${pass} ok, ${fail} échec(s)`);
if (fail > 0) process.exit(1);
