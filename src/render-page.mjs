import { materializeFamilyForest } from "./family-graph.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPerson(person) {
  return [
    `<span class="family-chart-person" data-family-person-id="${escapeHtml(person.id)}">`,
    `  <span class="family-chart-relation">${escapeHtml(person.relation)}</span>`,
    `  <span class="family-chart-name">${escapeHtml(person.name)}</span>`,
    person.note
      ? `  <span class="family-chart-person-note">${escapeHtml(person.note)}</span>`
      : "",
    "</span>",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderBranch(node, viewId) {
  const hasChildren = Boolean(node.children?.length);
  const familyLabel = node.people.map((person) => person.name).join("与");
  const unitClass = `family-chart-unit${node.people.length > 1 ? " family-chart-unit-couple" : ""}`;
  const people = `<span class="family-chart-people">${node.people.map(renderPerson).join("")}</span>`;

  if (!hasChildren) {
    return `<li class="family-chart-branch family-chart-branch-leaf" data-family-node-id="${escapeHtml(node.id)}">
      <div class="${unitClass}" role="group" aria-label="${escapeHtml(familyLabel)}">${people}</div>
    </li>`;
  }

  return `<li class="family-chart-branch family-chart-branch-expandable" data-family-node-id="${escapeHtml(node.id)}">
    <details class="family-chart-details" data-family-branch open>
      <summary class="${unitClass} family-chart-summary">
        ${people}
        <span class="family-chart-toggle" aria-hidden="true"></span>
        <span class="family-chart-toggle-label">展开或收起${escapeHtml(familyLabel)}的后代</span>
      </summary>
      <ol class="family-chart-level family-chart-children" id="${escapeHtml(viewId)}-${escapeHtml(node.id)}-children" aria-label="${escapeHtml(familyLabel)}的后代">
        ${node.children.map((child) => renderBranch(child, viewId)).join("")}
      </ol>
    </details>
  </li>`;
}

function formatUpdatedAt(value) {
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日更新`;
}

export function renderPage(document) {
  const viewId = "li-family";
  const treeId = `${viewId}-interactive-tree`;
  const titleId = `${viewId}-chart-title`;
  const noteId = `${viewId}-chart-note`;
  const roots = materializeFamilyForest(document);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#fcfcfb">
  <meta name="description" content="${escapeHtml(document.intro)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:title" content="${escapeHtml(document.title)}">
  <meta property="og:description" content="${escapeHtml(document.subtitle)}">
  <meta property="og:url" content="https://renzeyu.github.io/li/">
  <meta property="og:image" content="https://renzeyu.github.io/li/og.svg">
  <link rel="canonical" href="https://renzeyu.github.io/li/">
  <link rel="icon" href="./favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="./family-tree.css">
  <title>${escapeHtml(document.title)}</title>
</head>
<body>
  <a class="skip-link" href="#family-tree">跳到族谱</a>
  <main id="top">
    <header class="site-header">
      <p class="site-kicker">李氏／朱氏家族档案</p>
      <h1>${escapeHtml(document.title)}</h1>
      <p class="site-subtitle">${escapeHtml(document.subtitle)}</p>
      <p class="site-intro">${escapeHtml(document.intro)}</p>
      <p class="site-updated" data-family-updated>${escapeHtml(formatUpdatedAt(document.updatedAt))}</p>
    </header>

    <section class="tree-section" id="family-tree" aria-labelledby="${titleId}">
      <div
        class="family-viewer"
        data-family-interactive-tree
        data-li-family-tree
        data-family-tree-id="${escapeHtml(document.treeId)}"
        data-family-source="./family-tree.json"
        data-family-focus-person="${escapeHtml(document.defaultFocusPersonId)}"
        data-family-default-expand="all"
        data-family-profile-links="false"
        data-family-allow-query
      >
        <div class="family-chart-toolbar" role="group" aria-label="族谱展开控制">
          <button class="family-chart-action" type="button" data-family-expand-all aria-controls="${treeId}">全部展开</button>
          <button class="family-chart-action" type="button" data-family-collapse-all aria-controls="${treeId}">全部收起</button>
          <p class="family-chart-status" data-family-tree-status aria-live="polite" aria-atomic="true">默认展开全部家人</p>
        </div>

        <div class="family-chart-view">
          <div class="family-panel-heading">
            <h2 class="family-panel-title" id="${titleId}">完整族谱</h2>
            <p>选择任一家庭，可以单独展开或收起这一支。</p>
          </div>
          <div class="family-chart-scroll" id="${treeId}" role="region" aria-labelledby="${titleId}" aria-describedby="${noteId}" tabindex="0">
            <ol class="family-chart-level family-chart-root" data-family-root>
              ${roots.map((root) => renderBranch(root, viewId)).join("")}
            </ol>
          </div>
          <p class="family-chart-note" id="${noteId}">朱守芝在娘家与成家两处出现，均指同一人。线条表示已经确认的配偶与亲子关系；同一组子女按已知顺序排列，未注明长幼的不作推断。</p>
        </div>
      </div>
    </section>

    <section class="reading-note" aria-labelledby="reading-note-title">
      <h2 id="reading-note-title">阅读说明</h2>
      <p>本页只记录姓名、亲属关系和必要说明。每个人只在中央数据中定义一次，族谱会随着新的姓名与关系继续补充；已有稳定人物编号不会随页面调整而改变，便于未来个人页面共用同一份数据。</p>
    </section>

    <footer>
      <p>李家族谱</p>
      <a href="#top">回到顶部</a>
    </footer>
  </main>
  <script src="./family-tree.js" defer data-static-interaction></script>
</body>
</html>`;
}
