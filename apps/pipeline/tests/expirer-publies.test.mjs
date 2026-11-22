import { estPublieExpirable, dateDuJour } from "../expiration.mjs";

/**
 * Tests unitaires — offline (job CI "quality"). Prédicat pur
 * (expiration.mjs) miroir de la clause WHERE de expirer-publies.mjs ; la
 * vraie UPDATE SQL n'est testable qu'en intégration.
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

// 22/11/2026 à 12:00 UTC = 13:00 à Casablanca (UTC+1).
const maintenant = new Date("2026-11-22T12:00:00Z");
const hier = "2026-11-21";
const aujourdhui = "2026-11-22";
const demain = "2026-11-23";

console.log("estPublieExpirable — date de fin");
{
  check("hier → expire", estPublieExpirable({ statut: "publie", dateFin: hier }, maintenant) === true);
  check("aujourd'hui → reste publie", estPublieExpirable({ statut: "publie", dateFin: aujourdhui }, maintenant) === false);
  check("demain → reste publie", estPublieExpirable({ statut: "publie", dateFin: demain }, maintenant) === false);
  check("sans date de fin → reste publie", estPublieExpirable({ statut: "publie", dateFin: null }, maintenant) === false);
}

console.log("estPublieExpirable — autres statuts jamais touchés");
{
  check("auto_draft non touché", estPublieExpirable({ statut: "auto_draft", dateFin: hier }, maintenant) === false);
  check("rejete non touché", estPublieExpirable({ statut: "rejete", dateFin: hier }, maintenant) === false);
  check("publie soft-supprimé non touché", estPublieExpirable({ statut: "publie", dateFin: hier, supprimeLe: "2026-11-01T00:00:00Z" }, maintenant) === false);
}

console.log("dateDuJour — fuseau Africa/Casablanca, pas UTC");
{
  // 23:30 UTC le 22/11 = 00:30 le 23/11 à Casablanca.
  const tard = new Date("2026-11-22T23:30:00Z");
  check("23:30 UTC → déjà le lendemain à Casablanca", dateDuJour(tard) === "2026-11-23");
  check("date de fin du 22 expire à 23:30 UTC", estPublieExpirable({ statut: "publie", dateFin: "2026-11-22" }, tard) === true);
}

console.log(`\n${pass} ok, ${fail} échec(s)`);
if (fail > 0) process.exit(1);
