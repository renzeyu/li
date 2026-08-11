import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { validateFamilyDocument } from "../scripts/validate-data.mjs";
import {
  countRenderedForest,
  indexFamilyDocument,
  materializeFamilyForest,
} from "../src/family-graph.mjs";

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

async function readFamilyDocument() {
  return JSON.parse(await readFile(new URL("family-tree.json", publicRoot), "utf8"));
}

function personIds(references) {
  return references.map((reference) => reference.personId);
}

function childGroup(family, groupId) {
  const group = family.childrenGroups?.find((candidate) => candidate.id === groupId);
  assert.ok(group, `missing children group ${groupId}`);
  return group;
}

test("builds the complete normalized Li family genealogy", async () => {
  const [html, document] = await Promise.all([
    readFile(new URL("index.html", docs), "utf8"),
    readFamilyDocument(),
  ]);
  const renderedCounts = countRenderedForest(materializeFamilyForest(document));

  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>李家族谱<\/title>/);
  assert.match(html, /李氏／朱氏家族档案/);
  assert.match(html, /李开训与朱守芝一家/);
  assert.match(html, /data-family-default-expand="all"/);
  assert.match(html, /data-family-profile-links="false"/);
  assert.match(html, />完整族谱</);
  assert.match(html, />全部展开</);
  assert.match(html, />全部收起</);
  assert.equal(countMatches(html, /data-family-node-id=/g), renderedCounts.nodeCount);
  assert.equal(countMatches(html, /data-family-person-id=/g), renderedCounts.personOccurrenceCount);
  assert.equal(countMatches(html, /<details\b/gi), renderedCounts.expandableCount);
  assert.equal(
    countMatches(html, /<details\b[^>]*\sopen(?=\s|>)/gi),
    renderedCounts.expandableCount,
  );

  for (const { name } of document.people) {
    assert.match(html, new RegExp(`class="family-chart-name">${name}<\\/span>`));
  }
  assert.equal(
    countMatches(html, /class="family-chart-name">李克珍<\/span>/g),
    2,
  );
  assert.match(html, /李开训的母亲/);
  assert.match(html, /1960年去世，时年4岁/);
  assert.doesNotMatch(visibleText(html), /李克霞/);
  assert.doesNotMatch(visibleText(html), /李开训的奶奶|时年6岁/);
  assert.doesNotMatch(html, /信息不公开|家人口述补名|存活排行/);
  assert.doesNotMatch(html, /<a\b[^>]*>李平<\/a>|<a\b[^>]*>任东风<\/a>/);
  assert.doesNotMatch(
    visibleText(html),
    /[，。！？；：、][ \t]+|[ \t]+[，。！？；：、]/u,
  );
  assert.match(html, /朱守芝在娘家与成家两处出现，均指同一人/);
  assert.match(html, /id="family-migration"/);
  assert.match(html, />家族迁徙</);
  assert.match(html, /data-migration-stop-id="zhu-ming-migration"/);
  assert.match(html, /data-migration-stop-id="zhu-daoan-shouxian"/);
  assert.match(html, /山东老鸹巷至寿县/);
  assert.match(html, /朱守芝的父亲朱道安曾任寿县县令/);
  assert.match(html, /河南寿县，晏口集杨家岗／淮南朱家岗/);
  assert.match(html, /淮南蔡家岗谢家集区建井西村63幢西头第二户/);
  assert.match(html, /宿州三十三处四工区安装机电/);
  assert.ok(html.indexOf('id="family-tree"') < html.indexOf('id="family-migration"'));
  assert.ok(html.indexOf('id="family-migration"') < html.indexOf('class="reading-note"'));
  assert.match(html, /href="https:\/\/renzeyu\.github\.io\/li\/"/);
  assert.match(html, /src="\.\/family-tree\.js"/);
  assert.match(html, /href="\.\/family-tree\.css"/);
});

test("ships one validated schema v2 genealogy graph", async () => {
  const dataSource = await readFile(new URL("family-tree.json", publicRoot), "utf8");
  const document = JSON.parse(dataSource);
  const counts = validateFamilyDocument(document);

  assert.deepEqual(counts, {
    personCount: 48,
    familyCount: 14,
    rootFamilyCount: 2,
    relationshipCount: 1,
  });
  assert.equal(document.schemaVersion, 2);
  assert.equal(document.treeId, "li-zhu-family");
  assert.equal(document.defaultFocusPersonId, "li-ping");
  assert.equal(document.focusFamilyId, "li-kaixun-zhu-shouzhi-family");
  assert.deepEqual(document.rootFamilyIds, ["li-father-family", "zhu-daoan-family"]);
  assert.equal(
    document.families.flatMap((family) => family.childrenGroups ?? []).length,
    15,
  );

  const { people, families } = indexFamilyDocument(document);
  assert.equal(people.get("li-kexia")?.name, "李克珍");
  assert.equal(people.get("li-kezhen-kaigong")?.name, "李克珍");
  assert.notEqual("li-kexia", "li-kezhen-kaigong");
  assert.equal([...people.values()].filter((person) => person.name === "李克珍").length, 2);
  assert.equal(people.get("li-kaixun-father")?.note, "40多岁去世");
  assert.equal(people.get("li-kaixun-mother")?.name, "李开训的母亲");
  assert.equal(people.get("li-kaixun-mother")?.note, "活到80多岁");
  assert.equal(people.has("li-kaixun-grandmother"), false);
  assert.equal(people.get("li-kexia")?.note, "李玉珍的双胞胎姐姐；1960年去世，时年4岁");
  assert.match(people.get("li-kaiting")?.note ?? "", /老叔.*好姥爷.*电焊工/);
  assert.match(people.get("li-kaiting-wife")?.note ?? "", /江淮汽修公司.*售货员/);
  assert.match(people.get("li-keli")?.note ?? "", /银行/);
  assert.match(people.get("li-kelei-son")?.note ?? "", /江淮汽车制造厂/);

  const twinRelationship = document.relationships.find(
    (relationship) => relationship.id === "li-kexia-li-yuzhen-twins",
  );
  assert.equal(twinRelationship?.type, "twin");
  assert.deepEqual(twinRelationship?.people, ["li-kexia", "li-yuzhen"]);
  assert.equal(twinRelationship?.olderPersonId, "li-kexia");

  const fatherChildren = childGroup(families.get("li-father-family"), "li-father-children");
  assert.deepEqual(personIds(families.get("li-father-family").partners), [
    "li-kaixun-father",
    "li-kaixun-mother",
  ]);
  assert.equal(families.has("li-grandmother-family"), false);
  assert.deepEqual(personIds(fatherChildren.children), [
    "li-kaixun",
    "li-nianiang",
    "li-kaigong",
    "li-kaiting",
  ]);
  const kaigongSons = childGroup(families.get("li-kaigong-family"), "li-kaigong-sons");
  const kaigongDaughters = childGroup(
    families.get("li-kaigong-family"),
    "li-kaigong-daughters",
  );
  assert.equal(kaigongSons.ordered, false);
  assert.deepEqual(personIds(kaigongSons.children), ["li-kehuai", "li-kenan"]);
  assert.equal(kaigongDaughters.ordered, true);
  assert.deepEqual(personIds(kaigongDaughters.children), [
    "li-kelan",
    "li-kezhen-kaigong",
    "li-kemei",
    "li-keshu",
    "li-kezhi",
    "li-keling",
  ]);
  assert.deepEqual(
    personIds(childGroup(families.get("li-kaiting-family"), "li-kaiting-children").children),
    ["li-kelei", "li-keli"],
  );
  assert.deepEqual(
    personIds(childGroup(families.get("li-kelei-family"), "li-kelei-children").children),
    ["li-kelei-son"],
  );

  const docsData = await readFile(new URL("family-tree.json", docs), "utf8");
  assert.equal(docsData, dataSource);
  assert.doesNotMatch(dataSource, /李克霞|信息不公开|家人口述补名|存活排行/);
});

test("records the family migration without duplicating genealogy identities", async () => {
  const document = await readFamilyDocument();
  const migration = document.migration;

  assert.equal(migration.title, "家族迁徙");
  assert.equal(migration.routes.length, 1);
  assert.equal(migration.routes[0].id, "li-zhu-family-route");
  assert.equal(migration.routes[0].stops.length, 8);

  const stops = new Map(migration.routes[0].stops.map((stop) => [stop.id, stop]));
  const mingMigration = stops.get("zhu-ming-migration");
  assert.equal(mingMigration.period, "明初大移民");
  assert.equal(mingMigration.place, "山东老鸹巷至寿县");
  assert.equal(mingMigration.summary, "朱氏先祖由山东老鸹巷迁至寿县。");
  assert.equal(Object.hasOwn(mingMigration, "personIds"), false);

  const zhuDaoanShouxian = stops.get("zhu-daoan-shouxian");
  assert.equal(zhuDaoanShouxian.period, "后世");
  assert.equal(zhuDaoanShouxian.place, "寿县");
  assert.equal(zhuDaoanShouxian.summary, "朱守芝的父亲朱道安曾任寿县县令。");
  assert.deepEqual(zhuDaoanShouxian.personIds, ["zhu-daoan"]);
  assert.equal(
    document.people.find((person) => person.id === "zhu-daoan")?.note,
    "曾任寿县县令",
  );

  assert.equal(
    stops.get("parents-birthplaces").place,
    "河南寿县，晏口集杨家岗／淮南朱家岗",
  );
  assert.deepEqual(stops.get("parents-birthplaces").personIds, ["li-kaixun", "zhu-shouzhi"]);
  assert.deepEqual(stops.get("caijiagang-birthplace").personIds, [
    "li-kexia",
    "li-yuzhen",
    "li-kun",
    "li-yuxia",
    "li-ping",
    "li-hui",
  ]);
  assert.equal(stops.get("suzhou-installation").place, "宿州三十三处四工区安装机电");
  assert.equal(stops.get("installation-office").place, "机电安装处");
  assert.match(stops.get("regional-dispersal").place, /淮北、合肥与昆山/);
  assert.match(stops.get("recent-settlement").summary, /李玉霞.*宿州安装处.*苏州昆山/);
});

test("preserves the confirmed Wu, Xu, Li Kun, Peng, and Zhao branches", async () => {
  const document = await readFamilyDocument();
  const { people, families } = indexFamilyDocument(document);
  const expectedPeople = new Map([
    ["wu-qinghua", "吴庆华"],
    ["wu-fang", "吴芳"],
    ["xu-dapeng", "许大鹏"],
    ["xu-jinghan", "许婧涵"],
    ["xu-lingxi", "许灵熙"],
    ["li-zirong", "李自荣"],
    ["li-jiqing", "李季晴"],
    ["li-bulong", "李部龙"],
    ["li-yuchen", "李宇晨"],
    ["li-jiaying", "李珈莹"],
    ["peng-xuejian", "彭学俭"],
    ["peng-peng", "彭鹏"],
    ["peng-peng-spouse", "彭鹏的配偶"],
    ["peng-peng-daughter", "彭鹏的女儿"],
    ["zhao-jingwen", "赵景文"],
    ["zhao-xinhua", "赵新华"],
    ["zhao-xiaomei", "赵小梅"],
    ["zhao-xiaohu", "赵小虎"],
  ]);
  for (const [personId, name] of expectedPeople) {
    assert.equal(people.get(personId)?.name, name, `incorrect name for ${personId}`);
  }

  assert.deepEqual(
    personIds(families.get("li-yuzhen-wu-qinghua-family").partners),
    ["li-yuzhen", "wu-qinghua"],
  );
  assert.deepEqual(
    personIds(childGroup(families.get("li-yuzhen-wu-qinghua-family"), "li-yuzhen-children").children),
    ["wu-fang"],
  );
  assert.deepEqual(
    personIds(families.get("wu-fang-xu-dapeng-family").partners),
    ["wu-fang", "xu-dapeng"],
  );
  const xuChildren = childGroup(families.get("wu-fang-xu-dapeng-family"), "wu-fang-children");
  assert.equal(xuChildren.ordered, false);
  assert.deepEqual(personIds(xuChildren.children), ["xu-jinghan", "xu-lingxi"]);

  assert.deepEqual(
    personIds(families.get("li-kun-li-zirong-family").partners),
    ["li-kun", "li-zirong"],
  );
  assert.deepEqual(
    personIds(childGroup(families.get("li-kun-li-zirong-family"), "li-kun-children").children),
    ["li-jiqing"],
  );
  assert.deepEqual(
    personIds(families.get("li-jiqing-li-bulong-family").partners),
    ["li-jiqing", "li-bulong"],
  );
  const liJiqingChildren = childGroup(
    families.get("li-jiqing-li-bulong-family"),
    "li-jiqing-children",
  );
  assert.equal(liJiqingChildren.ordered, false);
  assert.deepEqual(personIds(liJiqingChildren.children), ["li-yuchen", "li-jiaying"]);

  assert.deepEqual(
    personIds(families.get("li-yuxia-peng-xuejian-family").partners),
    ["li-yuxia", "peng-xuejian"],
  );
  assert.deepEqual(
    personIds(childGroup(families.get("li-yuxia-peng-xuejian-family"), "li-yuxia-children").children),
    ["peng-peng"],
  );
  assert.deepEqual(
    personIds(families.get("peng-peng-family").partners),
    ["peng-peng", "peng-peng-spouse"],
  );
  assert.deepEqual(
    personIds(childGroup(families.get("peng-peng-family"), "peng-peng-children").children),
    ["peng-peng-daughter"],
  );

  assert.deepEqual(
    personIds(families.get("zhu-shourong-zhao-jingwen-family").partners),
    ["zhu-shourong", "zhao-jingwen"],
  );
  const zhaoChildren = childGroup(
    families.get("zhu-shourong-zhao-jingwen-family"),
    "zhu-shourong-children",
  );
  assert.equal(zhaoChildren.ordered, false);
  assert.deepEqual(personIds(zhaoChildren.children), [
    "zhao-xinhua",
    "zhao-xiaomei",
    "zhao-xiaohu",
  ]);
  assert.equal(people.get("zhao-xiaomei")?.note, "赵新华的妹妹");
});

test("rejects invalid normalized genealogy data", async () => {
  const document = await readFamilyDocument();

  const legacySchema = structuredClone(document);
  legacySchema.schemaVersion = 1;
  assert.throws(() => validateFamilyDocument(legacySchema), /schemaVersion must be 2/);

  const duplicatePerson = structuredClone(document);
  duplicatePerson.people.push({ ...duplicatePerson.people[0] });
  assert.throws(() => validateFamilyDocument(duplicatePerson), /duplicate person id/);

  const unknownReference = structuredClone(document);
  unknownReference.families[0].childrenGroups[0].children[0].personId = "missing-person";
  assert.throws(() => validateFamilyDocument(unknownReference), /unknown person reference/);

  const duplicateParent = structuredClone(document);
  duplicateParent.families
    .find((family) => family.id === "li-kaigong-family")
    .childrenGroups[0].children.push({ personId: "li-kexia", relation: "女儿" });
  assert.throws(() => validateFamilyDocument(duplicateParent), /is a child in both/);

  const tooManyPartners = structuredClone(document);
  tooManyPartners.families[0].partners.push({ personId: "li-hui", relation: "成员" });
  tooManyPartners.families[0].partners.push({ personId: "li-keli", relation: "成员" });
  assert.throws(() => validateFamilyDocument(tooManyPartners), /more than two partners/);

  const duplicateMigrationStop = structuredClone(document);
  duplicateMigrationStop.migration.routes[0].stops[1].id =
    duplicateMigrationStop.migration.routes[0].stops[0].id;
  assert.throws(() => validateFamilyDocument(duplicateMigrationStop), /duplicate migration stop id/);

  const emptyMigrationPlace = structuredClone(document);
  emptyMigrationPlace.migration.routes[0].stops[0].place = "";
  assert.throws(() => validateFamilyDocument(emptyMigrationPlace), /requires place/);

  const unknownMigrationPerson = structuredClone(document);
  unknownMigrationPerson.migration.routes[0].stops[1].personIds.push("missing-person");
  assert.throws(() => validateFamilyDocument(unknownMigrationPerson), /references unknown person/);

  const duplicateMigrationPerson = structuredClone(document);
  duplicateMigrationPerson.migration.routes[0].stops[1].personIds.push("zhu-daoan");
  assert.throws(() => validateFamilyDocument(duplicateMigrationPerson), /repeats person zhu-daoan/);

  const unreachableFamily = structuredClone(document);
  unreachableFamily.people.push({ id: "unreachable-person", name: "测试人物" });
  unreachableFamily.families.push({
    id: "unreachable-family",
    partners: [{ personId: "unreachable-person", relation: "成员" }],
    childrenGroups: [],
  });
  assert.throws(() => validateFamilyDocument(unreachableFamily), /unreachable from roots/);
});

test("ships a reusable, progressively enhanced renderer", async () => {
  const [script, css] = await Promise.all([
    readFile(new URL("family-tree.js", publicRoot), "utf8"),
    readFile(new URL("family-tree.css", publicRoot), "utf8"),
  ]);

  assert.match(script, /__LI_FAMILY_TREE_RENDERER_V2__/);
  assert.match(script, /family-tree\.json/);
  assert.match(script, /data-family-interactive-tree/);
  assert.match(script, /familyDefaultExpand/);
  assert.match(script, /familyProfileLinks/);
  assert.match(script, /rootFamilyIds/);
  assert.match(script, /materializeFamilyForest/);
  assert.match(script, /centerHorizontally/);
  assert.match(script, /fetch\(/);
  assert.match(script, /li-family-tree:ready/);
  assert.doesNotMatch(script, /innerHTML|setHTML\(/);
  assert.match(css, /\[data-li-family-tree\]/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.migration-section/);
  assert.match(css, /\.migration-stop\s*\{[\s\S]*?break-inside:\s*avoid;/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.migration-stop/);
  assert.match(css, /family-chart-details:not\(\[open\]\) > \.family-chart-children/);
  assert.match(
    css,
    /family-chart-branch:last-child::after\s*\{[\s\S]*?border-left:\s*0;/,
  );
  assert.match(css, /--paper:\s*#fcfcfb;/);
  assert.match(css, /--ink:\s*#171717;/);
  assert.match(css, /--muted:\s*#666662;/);
  assert.match(css, /--rule:\s*#d7d7d2;/);
  assert.match(css, /--rule-strong:\s*#9b9b95;/);
  assert.match(css, /--focus:\s*#8f2028;/);
  assert.doesNotMatch(css, /#f6f3eb|#eee9de|#cfc8ba/i);
});

test("uses the same neutral paper palette across browser and sharing assets", async () => {
  const [html, favicon, socialImage] = await Promise.all([
    readFile(new URL("index.html", docs), "utf8"),
    readFile(new URL("favicon.svg", publicRoot), "utf8"),
    readFile(new URL("og.svg", publicRoot), "utf8"),
  ]);

  assert.match(html, /name="theme-color" content="#fcfcfb"/);
  assert.match(favicon, /fill="#fcfcfb"/);
  assert.match(favicon, /stroke="#202020"/);
  assert.match(favicon, /fill="#171717">李</);
  assert.match(socialImage, /fill="#fcfcfb"/);
  assert.match(socialImage, /stroke="#202020"/);
  assert.match(socialImage, /fill="#171717">李家族谱</);

  for (const artifact of [html, favicon, socialImage]) {
    assert.doesNotMatch(artifact, /#f6f3eb|#eee9de|#cfc8ba/i);
  }
});

test("includes every GitHub Pages artifact", async () => {
  await Promise.all(
    [
      "index.html",
      "404.html",
      ".nojekyll",
      "family-tree.json",
      "family-tree.js",
      "family-tree.css",
      "favicon.svg",
      "og.svg",
    ].map((path) => access(new URL(path, docs))),
  );
});
