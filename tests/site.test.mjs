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
const expectedSiteIntro =
  "李氏先祖于明初由山东迁至寿县堰口集，朱氏一支生活在淮南朱家岗。1955年，李开训与朱守芝成家，育有五女一子，一家的生活与两淮煤矿建设紧密相连。家庭经历了1960年的饥荒与丧亲，后来随工作调动由淮南迁居宿州，子女也曾在不同城市求学和工作。几名子女分别从事劳资、财会和医疗工作，近年这一代兄弟姐妹主要生活在宿州和昆山。";

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
  assert.equal(document.intro, expectedSiteIntro);
  assert.ok(html.includes(`<p class="site-intro">${expectedSiteIntro}</p>`));
  assert.equal(countMatches(document.intro, /。/g), 4);
  assert.doesNotMatch(html, />李开训与朱守芝成家后育有五女一子。</);
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
  assert.match(html, /李云举/);
  assert.match(html, /李魏氏/);
  assert.match(html, /1960年去世，时年4岁/);
  assert.doesNotMatch(visibleText(html), /李克霞/);
  assert.doesNotMatch(visibleText(html), /李开训的奶奶|时年6岁/);
  assert.doesNotMatch(html, /信息不公开|家人口述补名|存活排行/);
  assert.doesNotMatch(html, /<a\b[^>]*>李平<\/a>|<a\b[^>]*>任东风<\/a>/);
  assert.doesNotMatch(
    visibleText(html),
    /[，。！？；：、][ \t]+|[ \t]+[，。！？；：、]/u,
  );
  assert.doesNotMatch(
    visibleText(html),
    /朱守芝在娘家与成家两处出现|线条表示已经确认|未注明长幼|不作推断|也已纳入|阅读说明|中央数据|稳定人物编号/,
  );
  assert.match(html, /淮北市商务局会计师/);
  assert.match(html, /昆山市中医医院护士/);
  assert.match(html, /淮南市公交公司工作/);
  assert.match(html, /id="family-history"/);
  assert.match(html, />家族历史</);
  assert.equal(countMatches(html, /data-family-history-id=/g), 5);
  assert.match(html, /清末民初，朱守芝的爷爷曾任河南省商丘市柘城县县令/);
  assert.match(html, /双胞胎长女李克珍也因饥饿去世，时年4岁/);
  assert.match(html, /李玉珍曾在农村生活和劳动约4年，李坤下乡7个月/);
  assert.match(html, /李父与吴父是同乡好友/);
  assert.match(html, /淮北矿务局一机厂/);
  assert.match(html, /李坤在三十四处钻井队工作至退休/);
  assert.match(html, /李玉霞与彭学俭两家为邻，二人自幼相识/);
  assert.match(html, /李玉霞、李平和李惠参加中考、高考时，都曾返回淮北报名和应考/);
  assert.match(html, /几名子女分别在人事、财会和医疗岗位任职/);
  assert.doesNotMatch(
    visibleText(html),
    /掌上明珠|人命如草芥|终身性格心结|野蛮岁月|低三下四|生死命脉|体制飞地|两地嫌弃|混子|白菜|铁血死命令|硬核专业方阵|神圣不可侵犯|底层的历史合流|地下堡垒|死死/,
  );
  assert.doesNotMatch(visibleText(html), /[—–]/);
  assert.match(html, /id="family-migration"/);
  assert.match(html, />家族迁徙</);
  assert.match(html, /data-migration-stop-id="li-ming-migration"/);
  assert.match(html, /data-migration-stop-id="zhu-family-zhujiagang"/);
  assert.match(html, /data-migration-stop-id="zhu-daoan-zhujiagang"/);
  assert.match(html, /data-migration-stop-id="zhu-grandfather-zhecheng"/);
  assert.match(html, /data-migration-stop-id="zhu-home-seized"/);
  assert.match(html, /山东老鸹巷至安徽省淮南市寿县堰口集/);
  assert.match(html, /朱守芝的爷爷曾任河南省商丘市柘城县县令/);
  assert.match(html, /朱氏先祖迁入淮南市谢家集区朱家岗/);
  assert.match(html, /朱道安曾在此任职/);
  assert.match(html, /朱家在打地主时期被人抢夺了宅邸/);
  assert.doesNotMatch(
    html,
    /zhu-ming-migration|zhu-ancestral-route|henan-shouxian-yankouji-yangjiagang|huainan-shouxian-yankouji-yangjiagang|河南寿县|晏口集|堰口集杨家岗|杨家岗|朱氏先祖由山东|朱道安[^<]*县令|朱守芝的父亲[^<]*县令|并没有迁徙|单位旧址尚待确认|尚未确认其与旧址的空间关系|公开地图尚不能核实具体楼幢|具体位置未在公开地图上标注/,
  );
  assert.match(html, /安徽省淮南市寿县堰口集/);
  assert.match(html, /淮南市谢家集区朱家岗/);
  assert.match(html, /淮南市谢家集区建井西村63号楼西头第二户/);
  assert.match(html, /宿州市埇桥区汴河东路27号中煤三建第三十三工程处/);
  assert.match(html, /宿州市埇桥区建设路安装处小区/);
  assert.equal(
    countMatches(
      html,
      /data-family-history-media-id="suzhou-anzhuangchu-xiaoqu-entrance"/g,
    ),
    1,
  );
  assert.match(
    html,
    /<img src="\.\/images\/suzhou-anzhuangchu-xiaoqu\.jpg" width="1800" height="988" alt="安装处小区入口，左侧建筑屋顶标有“工人俱乐部”，右侧为住宅楼。" loading="lazy" decoding="async">/,
  );
  assert.match(html, /宿州市埇桥区建设路安装处小区入口。图像来源：百度地图全景。/);
  assert.equal(
    countMatches(html, /data-family-history-media-id="li-ping-li-hui-young-photo"/g),
    1,
  );
  assert.match(
    html,
    /<img src="\.\/images\/li-ping-li-hui-young\.jpg" width="1632" height="1224" alt="李平与李惠年轻时并肩拍摄的黑白合影。" loading="lazy" decoding="async">/,
  );
  assert.match(html, /李平与李惠年轻时的合影。/);
  const historyPhotoIndex = html.indexOf(
    'data-family-history-media-id="suzhou-anzhuangchu-xiaoqu-entrance"',
  );
  const installationHistoryIndex = html.indexOf(
    'data-family-history-id="suzhou-life-and-exams"',
  );
  const nextHistoryIndex = html.indexOf(
    'data-family-history-id="education-and-careers"',
    installationHistoryIndex,
  );
  assert.ok(installationHistoryIndex < historyPhotoIndex);
  assert.ok(historyPhotoIndex < nextHistoryIndex);
  const siblingPhotoIndex = html.indexOf(
    'data-family-history-media-id="li-ping-li-hui-young-photo"',
  );
  const migrationIndex = html.indexOf('id="family-migration"');
  assert.ok(nextHistoryIndex < siblingPhotoIndex);
  assert.ok(siblingPhotoIndex < migrationIndex);
  assert.ok(html.indexOf('id="family-tree"') < html.indexOf('id="family-history"'));
  assert.ok(html.indexOf('id="family-history"') < html.indexOf('id="family-migration"'));
  assert.ok(html.indexOf('id="family-migration"') < html.indexOf("<footer>"));
  assert.match(html, /href="https:\/\/renzeyu\.github\.io\/li\/"/);
  assert.match(html, /src="\.\/family-tree\.js"/);
  assert.match(html, /src="\.\/family-map\.mjs"/);
  assert.match(html, /href="\.\/maplibre-gl\.css"/);
  assert.match(html, /href="\.\/family-tree\.css"/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
});

test("ships one validated schema v2 genealogy graph", async () => {
  const dataSource = await readFile(new URL("family-tree.json", publicRoot), "utf8");
  const document = JSON.parse(dataSource);
  const counts = validateFamilyDocument(document);

  assert.deepEqual(counts, {
    personCount: 52,
    familyCount: 16,
    rootFamilyCount: 2,
    relationshipCount: 1,
  });
  assert.equal(document.schemaVersion, 2);
  assert.equal(document.treeId, "li-zhu-family");
  assert.equal(document.defaultFocusPersonId, "li-ping");
  assert.equal(document.focusFamilyId, "li-kaixun-zhu-shouzhi-family");
  assert.deepEqual(document.rootFamilyIds, ["li-father-family", "zhu-grandfather-family"]);
  assert.equal(
    document.families.flatMap((family) => family.childrenGroups ?? []).length,
    16,
  );

  const { people, families } = indexFamilyDocument(document);
  assert.equal(people.get("li-kexia")?.name, "李克珍");
  assert.equal(people.get("li-kezhen-kaigong")?.name, "李克珍");
  assert.notEqual("li-kexia", "li-kezhen-kaigong");
  assert.equal([...people.values()].filter((person) => person.name === "李克珍").length, 2);
  assert.equal(people.get("li-kaixun-father")?.name, "李云举");
  assert.equal(people.get("li-kaixun-father")?.note, "40多岁去世");
  assert.equal(people.get("li-kaixun-mother")?.name, "李魏氏");
  assert.equal(people.get("li-kaixun-mother")?.note, "活到80多岁");
  assert.equal(people.get("li-nianiang")?.name, "嬢嬢");
  assert.equal(people.get("li-nianiang")?.note, "家中对姑姑的称呼");
  assert.equal(
    people.get("li-kaixun")?.note,
    "出生于安徽省淮南市寿县堰口集；井下采煤30多年；后随单位迁居宿州",
  );
  assert.equal(people.get("zhu-shouzhi-grandfather")?.name, "朱守芝的爷爷");
  assert.equal(
    people.get("zhu-shouzhi-grandfather")?.note,
    "清末民初曾任河南省商丘市柘城县县令",
  );
  assert.equal(
    people.get("zhu-daoan")?.note,
    "曾在淮南市谢家集区朱家岗任职；1960年去世",
  );
  assert.equal(people.get("zhu-liushi")?.note, "1960年去世");
  assert.equal(
    people.get("zhu-shouzhi")?.note,
    "出生于淮南市谢家集区朱家岗；家中长女，幼年读过4年私塾",
  );
  assert.equal(people.has("li-kaixun-grandmother"), false);
  assert.equal(people.get("li-kexia")?.note, "李玉珍的双胞胎姐姐；1960年去世，时年4岁");
  assert.equal(
    people.get("li-yuzhen")?.note,
    "李克珍的双胞胎妹妹；曾下乡约4年；后在淮北矿务局一机厂从事劳动工资工作；现居昆山",
  );
  assert.equal(people.get("wu-qinghua")?.note, "李父与吴父是同乡好友");
  assert.equal(
    people.get("li-kun")?.note,
    "家中长子；曾下乡7个月；在三十四处钻井队工作至退休；现居昆山",
  );
  assert.equal(
    people.get("li-yuxia")?.note,
    "接父亲的班进入安装处；毕业于徐州煤矿工业学校；从事会计工作至退休；近年居住在宿州市埇桥区建设路安装处小区",
  );
  assert.equal(people.get("peng-xuejian")?.note, "与李玉霞两家为邻，二人青梅竹马");
  assert.equal(people.get("li-kaigong")?.name, "李开功");
  assert.match(people.get("li-kaiting")?.note ?? "", /老叔.*好姥爷.*电焊工/);
  assert.equal(people.get("li-kaiting-wife")?.name, "王秀云");
  assert.equal(people.get("li-kaiting-wife")?.note, "在淮南市公交公司工作");
  assert.equal(
    people.get("li-ping")?.note,
    "1965年生；淮北市商务局会计师；现居昆山",
  );
  assert.equal(people.get("li-hui")?.note, "曾自费就读卫校；昆山市中医医院护士；现居昆山");
  assert.equal(people.get("ren-dongfeng")?.note, "1992年与李平结婚");
  assert.equal(people.get("li-kelei")?.note, "在江淮汽修公司工作");
  assert.equal(people.get("wang-mei")?.name, "王梅");
  assert.match(people.get("li-keli")?.note ?? "", /银行/);
  assert.equal(people.get("fang-hao")?.name, "方浩");
  assert.equal(people.get("fang-runtian")?.name, "方润田");
  assert.equal(people.get("li-kelei-son")?.name, "李烁维");
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
  assert.deepEqual(
    fatherChildren.children.map((child) => child.relation),
    ["长子", "长女", "次子", "三子"],
  );
  assert.equal(families.get("li-kaixun-zhu-shouzhi-family").partners[0].relation, "长子");
  assert.equal(families.get("li-kaigong-family").partners[0].relation, "次子");
  assert.equal(families.get("li-kaiting-family").partners[0].relation, "三子");
  assert.deepEqual(personIds(families.get("zhu-grandfather-family").partners), [
    "zhu-shouzhi-grandfather",
  ]);
  assert.deepEqual(
    personIds(
      childGroup(families.get("zhu-grandfather-family"), "zhu-grandfather-children").children,
    ),
    ["zhu-daoan"],
  );
  const kaigongChildren = childGroup(
    families.get("li-kaigong-family"),
    "li-kaigong-children",
  );
  assert.equal(kaigongChildren.ordered, true);
  assert.deepEqual(personIds(kaigongChildren.children), [
    "li-kehuai",
    "li-kenan",
    "li-kelan",
    "li-kezhen-kaigong",
    "li-kemei",
    "li-keshu",
    "li-kezhi",
    "li-keling",
  ]);
  assert.deepEqual(
    kaigongChildren.children.map((child) => child.relation),
    ["长子", "次子", "长女", "次女", "三女", "四女", "五女", "六女"],
  );
  assert.deepEqual(
    personIds(childGroup(families.get("li-kaiting-family"), "li-kaiting-children").children),
    ["li-kelei", "li-keli"],
  );
  assert.deepEqual(
    childGroup(families.get("li-kaiting-family"), "li-kaiting-children").children.map(
      (child) => child.relation,
    ),
    ["长子", "长女"],
  );
  assert.deepEqual(
    personIds(families.get("li-kelei-family").partners),
    ["li-kelei", "wang-mei"],
  );
  assert.deepEqual(
    personIds(childGroup(families.get("li-kelei-family"), "li-kelei-children").children),
    ["li-kelei-son"],
  );
  assert.deepEqual(
    personIds(families.get("li-keli-fang-hao-family").partners),
    ["li-keli", "fang-hao"],
  );
  assert.equal(families.get("li-keli-fang-hao-family").partners[0].relation, "长女");
  assert.deepEqual(
    personIds(
      childGroup(families.get("li-keli-fang-hao-family"), "li-keli-children").children,
    ),
    ["fang-runtian"],
  );

  const docsData = await readFile(new URL("family-tree.json", docs), "utf8");
  assert.equal(docsData, dataSource);
  assert.doesNotMatch(
    dataSource,
    /李克霞|信息不公开|家人口述补名|存活排行|李开工|淮北面粉厂|1993年与李平结婚|小名；李开训的妹妹|彭鹏的配偶|彭鹏的女儿/,
  );
});

test("records an objective family history linked to stable people", async () => {
  const document = await readFamilyDocument();
  const history = document.history;

  assert.equal(history.title, "家族历史");
  assert.equal(history.sections.length, 5);
  assert.deepEqual(
    history.sections.map((section) => section.id),
    [
      "family-background-and-marriage",
      "famine-and-bereavement",
      "countryside-and-work-transfer",
      "suzhou-life-and-exams",
      "education-and-careers",
    ],
  );
  assert.equal(
    history.sections.find((section) => section.id === "family-background-and-marriage")
      ?.period,
    "清末民初至1955年",
  );
  assert.deepEqual(
    history.sections.find((section) => section.id === "countryside-and-work-transfer")
      ?.personIds,
    ["li-kaixun", "li-yuzhen", "wu-qinghua", "li-kun", "li-yuxia", "peng-xuejian"],
  );
  assert.match(JSON.stringify(history), /1960年饥荒期间/);
  assert.match(JSON.stringify(history), /时年4岁/);
  assert.match(JSON.stringify(history), /前后在井下采煤30多年/);
  assert.doesNotMatch(
    JSON.stringify(history),
    /这段经历成为全家共同的记忆|1965年，四女李平出生|父母在她的童年生活中给予了较多照顾|前后在井下采煤30年。/,
  );
  const bereavementSection = history.sections.find(
    (section) => section.id === "famine-and-bereavement",
  );
  assert.equal(bereavementSection.period, "1960年");
  assert.equal(bereavementSection.title, "饥荒与丧亲");
  assert.equal(bereavementSection.paragraphs.length, 1);
  assert.equal(bereavementSection.personIds.includes("li-ping"), false);
  assert.match(JSON.stringify(history), /徐州煤矿工业学校/);
  assert.match(JSON.stringify(history), /昆山市中医医院护士/);
  assert.match(JSON.stringify(history), /三十四处钻井队工作至退休/);
  const installationSection = history.sections.find(
    (section) => section.id === "suzhou-life-and-exams",
  );
  assert.equal(installationSection.media.length, 1);
  assert.deepEqual(installationSection.media[0], {
    id: "suzhou-anzhuangchu-xiaoqu-entrance",
    src: "./images/suzhou-anzhuangchu-xiaoqu.jpg",
    width: 1800,
    height: 988,
    alt: "安装处小区入口，左侧建筑屋顶标有“工人俱乐部”，右侧为住宅楼。",
    caption: "宿州市埇桥区建设路安装处小区入口。图像来源：百度地图全景。",
    placeId: "suzhou-installation-residence",
  });
  const careersSection = history.sections.find(
    (section) => section.id === "education-and-careers",
  );
  assert.ok(careersSection.personIds.includes("li-kun"));
  assert.deepEqual(careersSection.media, [
    {
      id: "li-ping-li-hui-young-photo",
      src: "./images/li-ping-li-hui-young.jpg",
      width: 1632,
      height: 1224,
      alt: "李平与李惠年轻时并肩拍摄的黑白合影。",
      caption: "李平与李惠年轻时的合影。",
      personIds: ["li-ping", "li-hui"],
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(history),
    /时年6岁|昆山胸科医院|逃难到了安徽淮南|掌上明珠|终身性格心结|体制飞地|两地嫌弃|混子|白菜|铁血|硬核|神圣不可侵犯|[—–]/,
  );
});

test("records the family migration without duplicating genealogy identities", async () => {
  const document = await readFamilyDocument();
  const migration = document.migration;

  assert.equal(migration.title, "家族迁徙");
  assert.equal(migration.routes.length, 1);
  assert.equal(migration.routes[0].id, "li-zhu-family-route");
  assert.equal(migration.routes[0].stops.length, 13);

  const stops = new Map(migration.routes[0].stops.map((stop) => [stop.id, stop]));
  const mingMigration = stops.get("li-ming-migration");
  assert.equal(mingMigration.period, "明初大移民");
  assert.equal(mingMigration.place, "山东老鸹巷至安徽省淮南市寿县堰口集");
  assert.equal(mingMigration.summary, "李氏先祖由山东老鸹巷迁至安徽省淮南市寿县堰口集。");
  assert.equal(Object.hasOwn(mingMigration, "personIds"), false);
  assert.deepEqual(mingMigration.placeIds, [
    "shandong-region",
    "shouxian-yankou-region",
  ]);

  const zhuFamilyZhujiagang = stops.get("zhu-family-zhujiagang");
  assert.equal(zhuFamilyZhujiagang.period, "先祖迁入");
  assert.equal(zhuFamilyZhujiagang.place, "淮南市谢家集区朱家岗");
  assert.equal(zhuFamilyZhujiagang.summary, "朱氏先祖迁入淮南市谢家集区朱家岗。");
  assert.deepEqual(zhuFamilyZhujiagang.placeIds, ["huainan-zhujiagang"]);
  assert.equal(Object.hasOwn(zhuFamilyZhujiagang, "personIds"), false);

  const zhuDaoanZhujiagang = stops.get("zhu-daoan-zhujiagang");
  assert.equal(zhuDaoanZhujiagang.summary, "朱道安曾在此任职。");
  assert.deepEqual(zhuDaoanZhujiagang.placeIds, ["huainan-zhujiagang"]);
  assert.deepEqual(zhuDaoanZhujiagang.personIds, ["zhu-daoan"]);

  const zhuGrandfatherZhecheng = stops.get("zhu-grandfather-zhecheng");
  assert.equal(zhuGrandfatherZhecheng.place, "河南省商丘市柘城县");
  assert.equal(zhuGrandfatherZhecheng.summary, "朱守芝的爷爷曾任河南省商丘市柘城县县令。");
  assert.deepEqual(zhuGrandfatherZhecheng.placeIds, ["zhecheng-region"]);
  assert.deepEqual(zhuGrandfatherZhecheng.personIds, ["zhu-shouzhi-grandfather"]);

  const zhuHomeSeized = stops.get("zhu-home-seized");
  assert.equal(zhuHomeSeized.summary, "朱家在打地主时期被人抢夺了宅邸。");
  assert.deepEqual(zhuHomeSeized.placeIds, ["huainan-zhujiagang"]);

  assert.equal(stops.get("li-kaixun-birthplace").place, "安徽省淮南市寿县堰口集");
  assert.deepEqual(stops.get("li-kaixun-birthplace").placeIds, ["shouxian-yankou-region"]);
  assert.deepEqual(stops.get("li-kaixun-birthplace").personIds, ["li-kaixun"]);
  assert.equal(stops.get("zhu-shouzhi-birthplace").place, "淮南市谢家集区朱家岗");
  assert.deepEqual(stops.get("zhu-shouzhi-birthplace").personIds, ["zhu-shouzhi"]);
  assert.deepEqual(stops.get("zhu-shouzhi-birthplace").placeIds, ["huainan-zhujiagang"]);
  assert.deepEqual(stops.get("caijiagang-birthplace").personIds, [
    "li-kexia",
    "li-yuzhen",
    "li-kun",
    "li-yuxia",
    "li-ping",
    "li-hui",
  ]);
  assert.equal(
    stops.get("suzhou-installation").place,
    "宿州市埇桥区汴河东路27号中煤三建第三十三工程处",
  );
  assert.deepEqual(stops.get("suzhou-installation").placeIds, ["suzhou-fourth-work-area"]);
  assert.equal(stops.get("installation-office").place, "机电安装处");
  assert.deepEqual(stops.get("installation-office").placeIds, ["suzhou-fourth-work-area"]);
  assert.match(stops.get("regional-dispersal").place, /淮北、合肥与昆山/);
  assert.equal(Object.hasOwn(stops.get("regional-dispersal"), "personIds"), false);
  assert.deepEqual(stops.get("recent-yuxia-settlement").personIds, ["li-yuxia"]);
  assert.equal(
    stops.get("recent-yuxia-settlement").place,
    "宿州市埇桥区建设路安装处小区",
  );
  assert.equal(
    stops.get("recent-yuxia-settlement").summary,
    "李玉霞近年居住在宿州市埇桥区建设路安装处小区。",
  );
  assert.deepEqual(stops.get("recent-kunshan-settlement").personIds, [
    "li-yuzhen",
    "li-kun",
    "li-ping",
    "li-hui",
  ]);
});

test("renders a progressive OpenFreeMap migration map without replacing the written record", async () => {
  const [document, html, script, css] = await Promise.all([
    readFamilyDocument(),
    readFile(new URL("index.html", docs), "utf8"),
    readFile(new URL("family-map.mjs", publicRoot), "utf8"),
    readFile(new URL("family-tree.css", publicRoot), "utf8"),
  ]);
  const map = document.migration.map;
  const places = new Map(map.places.map((place) => [place.id, place]));
  const exactPlaces = map.places.filter((place) => place.locationStatus === "located");
  const regionalAnchors = map.places.filter(
    (place) => place.locationStatus === "regional-anchor",
  );
  const unlocated = map.places.filter((place) => place.locationStatus === "unlocated");

  assert.equal(map.styleUrl, "https://tiles.openfreemap.org/styles/positron");
  assert.equal(map.coordinateSystem, "WGS84");
  assert.equal(map.views.length, 3);
  assert.equal(map.routes.length, 2);
  assert.equal(map.places.length, 10);
  assert.equal(exactPlaces.length, 2);
  assert.equal(regionalAnchors.length, 8);
  assert.equal(unlocated.length, 0);
  assert.deepEqual(places.get("shouxian-yankou-region")?.coordinates, [
    116.7889309,
    32.3848132,
  ]);
  assert.deepEqual(places.get("zhecheng-region")?.coordinates, [115.2765011, 34.1127169]);
  assert.deepEqual(places.get("huainan-zhujiagang")?.coordinates, [
    116.8378307,
    32.6062584,
  ]);
  assert.equal(places.get("huainan-zhujiagang")?.locationStatus, "regional-anchor");
  assert.match(
    places.get("huainan-zhujiagang")?.coordinateSource ?? "",
    /OpenStreetMap Nominatim：八公山镇朱岗村区域中心（relation 13665336）/,
  );
  assert.match(
    places.get("huainan-zhujiagang")?.coordinateNote ?? "",
    /区域锚点；不表示旧聚落边界、朱家旧宅、朱道安任职处或朱守芝出生地的具体位置/,
  );
  assert.match(
    places.get("suzhou-installation-residence")?.coordinateNote ?? "",
    /不表示个人住宅/,
  );
  assert.equal(
    places.get("suzhou-installation-residence")?.name,
    "宿州市埇桥区建设路安装处小区",
  );
  assert.deepEqual(places.get("jianjing-xicun-address")?.coordinates, [
    116.865969,
    32.599344,
  ]);
  assert.deepEqual(places.get("suzhou-fourth-work-area")?.coordinates, [
    117.01467,
    33.63119,
  ]);
  assert.deepEqual(places.get("suzhou-installation-residence")?.coordinates, [
    117.010564,
    33.626139,
  ]);
  for (const removedPlaceId of [
    "shandong-laoguaxiang",
    "huainan-shouxian-yankouji-yangjiagang",
    "huainan-region",
    "caijiagang-region",
    "anhui-suzhou-region",
    "suzhou-installation-office",
  ]) {
    assert.equal(places.has(removedPlaceId), false, `obsolete place remains: ${removedPlaceId}`);
  }
  assert.deepEqual(
    document.migration.routes[0].stops.find((stop) => stop.id === "regional-dispersal")
      ?.placeIds,
    ["huaibei-region", "hefei-region", "kunshan-region"],
  );
  assert.deepEqual(map.routes.find((route) => route.id === "li-ancestral-route")?.placeIds, [
    "shandong-region",
    "shouxian-yankou-region",
  ]);
  assert.equal(map.routes.some((route) => route.id === "zhu-ancestral-route"), false);
  assert.equal(
    map.routes.some(
      (route) =>
        route.placeIds.includes("huainan-zhujiagang") &&
        route.placeIds.includes("shandong-region"),
    ),
    false,
  );
  assert.deepEqual(
    map.routes.find((route) => route.id === "family-move-to-anhui-suzhou")?.placeIds,
    ["jianjing-xicun-address", "suzhou-fourth-work-area"],
  );

  assert.match(html, /class="migration-map-block"/);
  assert.match(html, /class="migration-layout"/);
  assert.match(html, /class="migration-directory" aria-label="居住与迁徙记录"/);
  assert.match(html, /data-family-map-source="\.\/family-tree\.json"/);
  assert.match(html, /aria-label="李家迁徙与朱家足迹交互地图"/);
  assert.match(html, />迁徙主线</);
  assert.match(html, />其后分布</);
  assert.match(html, />具体地点</);
  assert.match(html, />区域锚点</);
  assert.doesNotMatch(html, />尚待定位的地点|地点待定位</);
  assert.match(html, />安徽省淮南市寿县堰口集</);
  assert.match(html, />淮南市谢家集区朱家岗</);
  assert.ok(html.indexOf('class="migration-map-block"') < html.indexOf('class="migration-directory"'));
  assert.ok(html.indexOf('class="migration-directory"') < html.indexOf('class="migration-route"'));
  assert.equal(countMatches(html, /data-migration-stop-id=/g), 13);
  assert.equal(countMatches(html, /data-family-map-unlocated=/g), 0);
  assert.match(visibleText(html), /底图.*下方迁徙记录无需地图即可阅读/);

  assert.match(script, /from "\.\/maplibre-gl\.mjs"/);
  assert.match(script, /new URL\("\.\/family-tree\.json", import\.meta\.url\)/);
  assert.match(script, /cooperativeGestures:\s*true/);
  assert.match(script, /setDOMContent/);
  assert.match(script, /family-migration-routes/);
  assert.match(script, /prefers-reduced-motion/);
  assert.match(script, /ResizeObserver/);
  assert.match(script, /canvasIsVisible/);
  assert.doesNotMatch(script, /innerHTML|setHTML\(|unpkg|jsdelivr/);
  assert.match(css, /\.family-map-shell/);
  assert.match(css, /\.family-map-canvas/);
  assert.match(css, /\.family-map-marker/);
  assert.match(css, /\.family-map-marker-located/);
  assert.match(css, /\.family-map-dot-located/);
  assert.match(css, /@media print[\s\S]*?\.family-map-shell/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*?\.family-map-marker-dot/);
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
    ["peng-peng-spouse", "王新楠"],
    ["peng-peng-daughter", "彭莜婷"],
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
  assert.deepEqual(personIds(xuChildren.children), ["xu-jinghan", "xu-lingxi"]);
  assert.equal(xuChildren.ordered, true);
  assert.deepEqual(xuChildren.children.map((child) => child.relation), ["长女", "次女"]);

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
  assert.equal(liJiqingChildren.ordered, true);
  assert.deepEqual(personIds(liJiqingChildren.children), ["li-yuchen", "li-jiaying"]);
  assert.deepEqual(liJiqingChildren.children.map((child) => child.relation), ["长子", "长女"]);

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
  assert.equal(zhaoChildren.ordered, true);
  assert.deepEqual(personIds(zhaoChildren.children), [
    "zhao-xinhua",
    "zhao-xiaomei",
    "zhao-xiaohu",
  ]);
  assert.deepEqual(
    zhaoChildren.children.map((child) => child.relation),
    ["长子", "长女", "次子"],
  );
  assert.equal(people.get("zhao-xiaomei")?.note, "赵新华的妹妹");

  for (const family of document.families) {
    for (const group of family.childrenGroups ?? []) {
      if (group.children.length < 2) continue;
      assert.equal(group.ordered, true, `${group.id} must preserve the confirmed age order`);
      for (const child of group.children) {
        assert.match(
          child.relation,
          /^(?:长|次|[三四五六七八九十]+)[子女]$/,
          `${child.personId} requires a sibling rank in ${group.id}`,
        );
      }
    }
  }
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
  unknownMigrationPerson.migration.routes[0].stops
    .find((stop) => stop.id === "zhu-grandfather-zhecheng")
    .personIds.push("missing-person");
  assert.throws(() => validateFamilyDocument(unknownMigrationPerson), /references unknown person/);

  const duplicateMigrationPerson = structuredClone(document);
  duplicateMigrationPerson.migration.routes[0].stops
    .find((stop) => stop.id === "zhu-grandfather-zhecheng")
    .personIds.push("zhu-shouzhi-grandfather");
  assert.throws(
    () => validateFamilyDocument(duplicateMigrationPerson),
    /repeats person zhu-shouzhi-grandfather/,
  );

  const duplicateHistorySection = structuredClone(document);
  duplicateHistorySection.history.sections[1].id = duplicateHistorySection.history.sections[0].id;
  assert.throws(
    () => validateFamilyDocument(duplicateHistorySection),
    /duplicate history section id/,
  );

  const emptyHistoryParagraph = structuredClone(document);
  emptyHistoryParagraph.history.sections[0].paragraphs[0] = "";
  assert.throws(
    () => validateFamilyDocument(emptyHistoryParagraph),
    /paragraph 0 must be a non-empty string/,
  );

  const unknownHistoryPerson = structuredClone(document);
  unknownHistoryPerson.history.sections[0].personIds.push("missing-person");
  assert.throws(
    () => validateFamilyDocument(unknownHistoryPerson),
    /history section.*references unknown person missing-person/,
  );

  const duplicateHistoryPerson = structuredClone(document);
  duplicateHistoryPerson.history.sections[0].personIds.push("zhu-shouzhi");
  assert.throws(
    () => validateFamilyDocument(duplicateHistoryPerson),
    /history section.*repeats person zhu-shouzhi/,
  );

  const duplicateHistoryMedia = structuredClone(document);
  duplicateHistoryMedia.history.sections[0].media = [
    { ...duplicateHistoryMedia.history.sections[3].media[0] },
  ];
  assert.throws(
    () => validateFamilyDocument(duplicateHistoryMedia),
    /duplicate history media id/,
  );

  const unsafeHistoryMediaPath = structuredClone(document);
  unsafeHistoryMediaPath.history.sections[3].media[0].src = "/images/photo.jpg";
  assert.throws(
    () => validateFamilyDocument(unsafeHistoryMediaPath),
    /src must be a safe local image path/,
  );

  const invalidHistoryMediaWidth = structuredClone(document);
  invalidHistoryMediaWidth.history.sections[3].media[0].width = 0;
  assert.throws(
    () => validateFamilyDocument(invalidHistoryMediaWidth),
    /width must be a positive integer/,
  );

  const unknownHistoryMediaPlace = structuredClone(document);
  unknownHistoryMediaPlace.history.sections[3].media[0].placeId = "missing-place";
  assert.throws(
    () => validateFamilyDocument(unknownHistoryMediaPlace),
    /references unknown map place missing-place/,
  );

  const emptyHistoryMediaPlace = structuredClone(document);
  emptyHistoryMediaPlace.history.sections[3].media[0].placeId = "";
  assert.throws(
    () => validateFamilyDocument(emptyHistoryMediaPlace),
    /placeId must be a non-empty string when provided/,
  );

  const unknownHistoryMediaPerson = structuredClone(document);
  unknownHistoryMediaPerson.history.sections[4].media[0].personIds.push("missing-person");
  assert.throws(
    () => validateFamilyDocument(unknownHistoryMediaPerson),
    /references unknown person missing-person/,
  );

  const duplicateHistoryMediaPerson = structuredClone(document);
  duplicateHistoryMediaPerson.history.sections[4].media[0].personIds.push("li-ping");
  assert.throws(
    () => validateFamilyDocument(duplicateHistoryMediaPerson),
    /repeats person li-ping/,
  );

  const insecureMapStyle = structuredClone(document);
  insecureMapStyle.migration.map.styleUrl = "http://tiles.example.com/style";
  assert.throws(() => validateFamilyDocument(insecureMapStyle), /styleUrl must use https/);

  const duplicateMapPlace = structuredClone(document);
  duplicateMapPlace.migration.map.places.push({ ...duplicateMapPlace.migration.map.places[0] });
  assert.throws(() => validateFamilyDocument(duplicateMapPlace), /duplicate migration map place id/);

  const invalidCoordinates = structuredClone(document);
  invalidCoordinates.migration.map.places[0].coordinates = [181, 35];
  assert.throws(() => validateFamilyDocument(invalidCoordinates), /outside WGS84 bounds/);

  const coordinatesOnUnlocatedPlace = structuredClone(document);
  coordinatesOnUnlocatedPlace.migration.map.places.find(
    (place) => place.id === "shandong-region",
  ).locationStatus = "unlocated";
  assert.throws(
    () => validateFamilyDocument(coordinatesOnUnlocatedPlace),
    /cannot include coordinates while unlocated/,
  );

  const unknownMapPlace = structuredClone(document);
  unknownMapPlace.migration.routes[0].stops[0].placeIds.push("missing-place");
  assert.throws(() => validateFamilyDocument(unknownMapPlace), /unknown map place missing-place/);

  const unlocatedPlaceInView = structuredClone(document);
  const artificiallyUnlocated = unlocatedPlaceInView.migration.map.places.find(
    (place) => place.id === "shandong-region",
  );
  artificiallyUnlocated.locationStatus = "unlocated";
  delete artificiallyUnlocated.coordinates;
  delete artificiallyUnlocated.coordinateSource;
  assert.throws(
    () => validateFamilyDocument(unlocatedPlaceInView),
    /references an unlocated or unknown place shandong-region/,
  );

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
  assert.doesNotMatch(css, /\.tree-section\s*\{[^}]*border-(?:top|bottom):/);
  assert.match(css, /\.history-section/);
  assert.doesNotMatch(css, /\.history-section\s*\{[^}]*border-bottom:/);
  assert.match(css, /\.history-entry\s*\{[\s\S]*?break-inside:\s*avoid;/);
  assert.match(css, /\.history-entry:last-child\s*\{[^}]*border-bottom:\s*0;/);
  assert.match(css, /\.history-photo\s*\{[^}]*width:\s*min\(100%, 620px\);[^}]*max-width:\s*100%;[^}]*break-inside:\s*avoid;/);
  assert.match(css, /\.history-photo img\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*height:\s*auto;/);
  assert.doesNotMatch(css, /\.history-photo img\s*\{[^}]*border:/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.history-entry/);
  assert.match(css, /@media print[\s\S]*?\.history-entry/);
  assert.match(css, /\.migration-section/);
  assert.match(css, /\.migration-section\s*\{[\s\S]*?width:\s*min\(1180px,/);
  assert.doesNotMatch(css, /\.migration-section\s*\{[^}]*border-bottom:/);
  assert.match(css, /\.migration-layout\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.55fr\) minmax\(320px, 0\.8fr\);/);
  assert.doesNotMatch(css, /\.migration-layout\s*\{[^}]*border-top:/);
  assert.match(css, /\.migration-map-block\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*20px;/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*?\.migration-map-block\s*\{[\s\S]*?position:\s*static;/);
  assert.match(css, /@media print[\s\S]*?\.migration-layout\s*\{[\s\S]*?display:\s*block;/);
  assert.match(css, /\.migration-stop\s*\{[\s\S]*?break-inside:\s*avoid;/);
  assert.match(css, /\.migration-stop:last-child\s*\{[^}]*border-bottom:\s*0;/);
  assert.match(css, /\.family-map-unlocated li:last-child\s*\{[^}]*border-bottom:\s*0;/);
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
      "family-map.mjs",
      "maplibre-gl.mjs",
      "maplibre-gl-shared.mjs",
      "maplibre-gl-worker.mjs",
      "maplibre-gl.css",
      "maplibre-license.txt",
      "favicon.svg",
      "og.svg",
      "images/suzhou-anzhuangchu-xiaoqu.jpg",
      "images/li-ping-li-hui-young.jpg",
    ].map((path) => access(new URL(path, docs))),
  );
  assert.deepEqual(
    await readFile(new URL("images/suzhou-anzhuangchu-xiaoqu.jpg", docs)),
    await readFile(new URL("images/suzhou-anzhuangchu-xiaoqu.jpg", publicRoot)),
  );
  assert.deepEqual(
    await readFile(new URL("images/li-ping-li-hui-young.jpg", docs)),
    await readFile(new URL("images/li-ping-li-hui-young.jpg", publicRoot)),
  );
});
