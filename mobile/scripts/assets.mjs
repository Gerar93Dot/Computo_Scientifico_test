import { mkdir, copyFile, readdir } from "node:fs/promises";
const dest = "public/ocr";
await mkdir(dest, { recursive: true });
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  `${dest}/worker.min.js`,
);
for (const f of await readdir("node_modules/tesseract.js-core"))
  if (/\.wasm(?:\.js)?$/.test(f))
    await copyFile(`node_modules/tesseract.js-core/${f}`, `${dest}/${f}`);
for (const lang of ["spa", "eng"])
  await copyFile(
    `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `${dest}/${lang}.traineddata.gz`,
  );
console.log("OCR español e inglés copiado para lectura local.");
