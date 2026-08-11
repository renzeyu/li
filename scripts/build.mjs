import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderPage } from "../src/render-page.mjs";
import { validateFamilyDocument } from "./validate-data.mjs";

const root = resolve(import.meta.dirname, "..");
const publicDirectory = resolve(root, "public");
const outputDirectory = resolve(root, "docs");
const document = JSON.parse(await readFile(resolve(publicDirectory, "family-tree.json"), "utf8"));

validateFamilyDocument(document);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(publicDirectory, outputDirectory, { recursive: true });

const page = renderPage(document);
await Promise.all([
  writeFile(resolve(outputDirectory, "index.html"), `${page}\n`, "utf8"),
  writeFile(resolve(outputDirectory, "404.html"), `${page}\n`, "utf8"),
  writeFile(resolve(outputDirectory, ".nojekyll"), "", "utf8"),
]);

console.log(`Built GitHub Pages site in ${outputDirectory}`);

