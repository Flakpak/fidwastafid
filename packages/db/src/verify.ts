import { Pool } from "pg";
import { getPool, closePool, query, withTransaction } from "./index.js";

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

async function checkThrows(label: string, fn: () => unknown) {
  try {
    await fn();
    fail++;
    console.log(`FAIL  - ${label}`);
  } catch {
    pass++;
    console.log(`  ok  - ${label}`);
  }
}

/**
 * Aucun test ici n'ouvre de connexion réelle : `pg.Pool` ne se connecte qu'au
 * premier `query`/`connect`, donc on peut vérifier la forme de l'adaptateur
 * (source de config, singleton) sans base disponible en CI.
 */
async function main() {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  console.log("DATABASE_URL absent");
  await checkThrows("getPool() lève sans DATABASE_URL", () => getPool());

  console.log("\nDATABASE_URL présent");
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/fidwastafid_test";

  const poolA = getPool();
  check("getPool() retourne une instance Pool", poolA instanceof Pool);

  const poolB = getPool();
  check("getPool() est un singleton (même instance)", poolA === poolB);

  check("query est exportée", typeof query === "function");
  check("withTransaction est exportée", typeof withTransaction === "function");

  await closePool();

  const poolC = getPool();
  check("closePool() réinitialise le singleton (nouvelle instance)", poolC !== poolA);
  await closePool();

  if (original === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = original;
  }

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

main();
