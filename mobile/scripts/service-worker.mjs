import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = process.env.VITE_BASE_PATH || "/";
const files = (await readdir("dist/assets")).filter(f => /\.(js|css)$/.test(f)).map(f => base + "assets/" + f);
const id = createHash("sha256").update(files.join(",")).digest("hex").slice(0, 12);
const template = await readFile("public/sw.js", "utf8");
const precache = [base, ...["manifest.webmanifest", "icon-192.png", "icon-512.png"].map(f => base + f), ...files];
await writeFile("dist/sw.js", template
  .replace(/const CACHE = [^;]+;/, `const CACHE = PREFIX + "${id}";`)
  .replace(/c\.addAll\(\[[\s\S]*?\]\)/, `c.addAll(${JSON.stringify(precache)})`));
await writeFile("dist/.nojekyll", "");
