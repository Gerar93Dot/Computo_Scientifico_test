import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = (await readdir("dist/assets"))
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => "/assets/" + f);
const id = createHash("sha256")
  .update(files.join(","))
  .digest("hex")
  .slice(0, 12);
const template = await readFile("public/sw.js", "utf8");
const precache = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", ...files];
await writeFile("dist/sw.js", template
  .replace(/const CACHE = [^;]+;/, `const CACHE = "buruburu-${id}";`)
  .replace(/c\.addAll\(\[[\s\S]*?\]\)/, `c.addAll(${JSON.stringify(precache)})`));
