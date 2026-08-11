import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { validateFamilyDocument } from "../scripts/validate-data.mjs";

const docs = new URL("../docs/", import.meta.url);
const publicRoot = new URL("../public/", import.meta.url);

function countMatches(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "");
}

test("builds a complete standalone Li family genealogy", async () => {
  const html = await readFile(new URL("index.html", docs), "utf8");

  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>李家族谱<\/title>/);
  assert.match(html, /李氏／朱氏家族档案/);
  assert.match(html, /李开训与朱守芝一家/);
  assert.match(html, /data-family-default-expand="all"/);
  assert.match(html, /data-family-profile-links="false"/);
  assert.match(html, />完整族谱</);
  assert.match(html, />全部展开</);
  assert.match(html, />全部收起</);
  assert.equal(countMatches(html, /<details\b/gi), 3);
  assert.equal(countMatches(html, /<details\b[^>]*\sopen(?=\s|>)/gi), 3);

  for (const name of [
    "朱道安",
    "朱刘氏",
    "朱守芝",
    "朱守荣",
    "李开训",
    "李克霞",
    "李玉珍",
    "李坤",
    "李玉霞",
    "李平",
    "李惠",
    "任东风",
    "任泽宇"
  ]) {
    assert.match(html, new RegExp(`>${name}<`));
  }

  assert.doesNotMatch(html, /信息不公开|家人口述补名|存活排行/);
  assert.doesNotMatch(html, /<a\b[^>]*>李平<\/a>|<a\b[^>]*>任东风<\/a>/);
  assert.doesNotMatch(
    visibleText(html),
    /[，。！？；：、][ \t]+|[ \t]+[，。！？；：、]/u,
  );
  assert.match(html, /href="https:\/\/renzeyu\.github\.io\/li\/"/);
  assert.match(html, /src="\.\/family-tree\.js"/);
  assert.match(html, /href="\.\/family-tree\.css"/);
});

test("ships one validated central genealogy document", async () => {
  const dataSource = await readFile(new URL("family-tree.json", publicRoot), "utf8");
  const document = JSON.parse(dataSource);
  const counts = validateFamilyDocument(document);

  assert.deepEqual(counts, { nodeCount: 10, personCount: 13, expandableCount: 3 });
  assert.equal(document.treeId, "li-zhu-family");
  assert.equal(document.defaultFocusPersonId, "li-ping");
  assert.equal(document.relationships[0].type, "twin");
  assert.deepEqual(document.relationships[0].people, ["li-kexia", "li-yuzhen"]);
  assert.match(dataSource, /"relation": "三女"[\s\S]*"name": "李玉霞"/);
  assert.match(dataSource, /"relation": "四女"[\s\S]*"name": "李平"/);
  assert.match(dataSource, /"relation": "五女"[\s\S]*"name": "李惠"/);
  assert.doesNotMatch(dataSource, /信息不公开|家人口述补名|存活排行/);

  const docsData = await readFile(new URL("family-tree.json", docs), "utf8");
  assert.equal(docsData, dataSource);
});

test("ships a reusable, progressively enhanced renderer", async () => {
  const [script, css] = await Promise.all([
    readFile(new URL("family-tree.js", publicRoot), "utf8"),
    readFile(new URL("family-tree.css", publicRoot), "utf8"),
  ]);

  assert.match(script, /family-tree\.json/);
  assert.match(script, /data-family-interactive-tree/);
  assert.match(script, /familyDefaultExpand/);
  assert.match(script, /familyProfileLinks/);
  assert.match(script, /fetch\(/);
  assert.match(script, /li-family-tree:ready/);
  assert.doesNotMatch(script, /innerHTML|setHTML\(/);
  assert.match(css, /\[data-li-family-tree\]/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /family-chart-details:not\(\[open\]\) > \.family-chart-children/);
  assert.match(
    css,
    /family-chart-branch:last-child::after\s*\{[\s\S]*?border-left:\s*0;/,
  );
});

test("includes every GitHub Pages artifact", async () => {
  await Promise.all(
    ["index.html", "404.html", ".nojekyll", "family-tree.json", "family-tree.js", "family-tree.css", "favicon.svg", "og.svg"].map(
      (path) => access(new URL(path, docs)),
    ),
  );
});
