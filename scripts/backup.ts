import { openDatabase } from "../server/db.js";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
const db = openDatabase();
const target = resolve(
  process.argv[2] ||
    `backups/tomsawyer-${new Date().toISOString().replaceAll(":", "-")}.db`,
);
mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
db.prepare("VACUUM INTO ?").run(target);
chmodSync(target, 0o600);
db.close();
console.log(`Consistent backup saved to ${target}`);
