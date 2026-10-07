import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = (await readdir("dist/client/assets")).map((a) => `/assets/${a}`);
const precache = [
  "/",
  "/offline.html",
  "/icon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  ...assets,
];
const hash = createHash("sha256")
  .update(assets.join())
  .digest("hex")
  .slice(0, 12);
let sw = await readFile("public/sw.js", "utf8");
sw = sw
  .replace("'tomsawyer-shell-v1'", `'tomsawyer-shell-${hash}'`)
  .replace(/\/\* PRECACHE \*\/ \[[^;]+\]/, JSON.stringify(precache));
await writeFile("dist/client/sw.js", sw);
