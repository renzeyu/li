(function () {
  "use strict";

  if (window.__LI_FAMILY_TREE_RENDERER_V1__) return;
  window.__LI_FAMILY_TREE_RENDERER_V1__ = true;

  const rendererScript = document.currentScript;
  const assetBase = rendererScript?.src
    ? new URL("./", rendererScript.src)
    : new URL("./", window.location.href);

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }

  function assertFamilyDocument(documentData) {
    if (!documentData || documentData.schemaVersion !== 1 || !documentData.root) {
      throw new Error("Unsupported family data");
    }
  }

  function collectPeople(node, people = new Map()) {
    node.people.forEach((person) => people.set(person.id, person));
    node.children?.forEach((child) => collectPeople(child, people));
    return people;
  }

  function expandedPath(root, focusPersonId) {
    const expandedIds = new Set();

    function visit(node) {
      let containsFocus = node.people.some((person) => person.id === focusPersonId);
      node.children?.forEach((child) => {
        if (visit(child)) containsFocus = true;
      });
      if (containsFocus && node.children?.length) expandedIds.add(node.id);
      return containsFocus;
    }

    if (!visit(root) && root.children?.length) expandedIds.add(root.id);
    return expandedIds;
  }

  function expandedAll(root, ids = new Set()) {
    if (root.children?.length) ids.add(root.id);
    root.children?.forEach((child) => expandedAll(child, ids));
    return ids;
  }

  function renderPerson(person, showProfileLinks) {
    const personNode = element("span", "family-chart-person");
    personNode.dataset.familyPersonId = person.id;
    personNode.append(element("span", "family-chart-relation", person.relation));

    const nameNode = element("span", "family-chart-name");
    const href = safeUrl(person.href);
    if (href && showProfileLinks) {
      const link = element("a", "", person.name);
      link.href = href;
      link.addEventListener("click", (event) => event.stopPropagation());
      nameNode.append(link);
    } else {
      nameNode.textContent = person.name;
    }
    personNode.append(nameNode);

    if (person.note) {
      personNode.append(element("span", "family-chart-person-note", person.note));
    }
    return personNode;
  }

  function renderPeople(node, showProfileLinks) {
    const peopleNode = element("span", "family-chart-people");
    node.people.forEach((person) => peopleNode.append(renderPerson(person, showProfileLinks)));
    return peopleNode;
  }

  function renderBranch(node, expandedIds, viewId, showProfileLinks) {
    const hasChildren = Boolean(node.children?.length);
    const familyLabel = node.people.map((person) => person.name).join("与");
    const branch = element(
      "li",
      `family-chart-branch ${hasChildren ? "family-chart-branch-expandable" : "family-chart-branch-leaf"}`,
    );
    branch.dataset.familyNodeId = node.id;
    const unitClassName = `family-chart-unit${node.people.length > 1 ? " family-chart-unit-couple" : ""}`;

    if (!hasChildren) {
      const unit = element("div", unitClassName);
      unit.setAttribute("role", "group");
      unit.setAttribute("aria-label", familyLabel);
      unit.append(renderPeople(node, showProfileLinks));
      branch.append(unit);
      return branch;
    }

    const details = element("details", "family-chart-details");
    details.dataset.familyBranch = "";
    details.open = expandedIds.has(node.id);

    const summary = element("summary", `${unitClassName} family-chart-summary`);
    summary.append(renderPeople(node, showProfileLinks));
    const toggle = element("span", "family-chart-toggle");
    toggle.setAttribute("aria-hidden", "true");
    summary.append(toggle);
    summary.append(
      element("span", "family-chart-toggle-label", `展开或收起${familyLabel}的后代`),
    );
    details.append(summary);

    const children = element("ol", "family-chart-level family-chart-children");
    children.id = `${viewId}-${node.id}-children`;
    children.setAttribute("aria-label", `${familyLabel}的后代`);
    node.children.forEach((child) =>
      children.append(renderBranch(child, expandedIds, viewId, showProfileLinks)),
    );
    details.append(children);
    branch.append(details);
    return branch;
  }

  function updateControls(tree, message) {
    const branches = Array.from(tree.querySelectorAll("details[data-family-branch]"));
    const expandedCount = branches.filter((branch) => branch.open).length;
    const expandAllButton = tree.querySelector("[data-family-expand-all]");
    const collapseAllButton = tree.querySelector("[data-family-collapse-all]");
    const status = tree.querySelector("[data-family-tree-status]");
    if (expandAllButton) expandAllButton.disabled = expandedCount === branches.length;
    if (collapseAllButton) collapseAllButton.disabled = expandedCount === 0;
    if (status) {
      status.textContent = message ?? `已展开${expandedCount}个分支，共${branches.length}个`;
    }
  }

  function enhanceControls(tree, initialMessage) {
    if (tree.dataset.controlsEnhanced === "true") {
      updateControls(tree, initialMessage);
      return;
    }
    tree.dataset.controlsEnhanced = "true";
    tree.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || !tree.contains(button)) return;
      const branches = Array.from(tree.querySelectorAll("details[data-family-branch]"));
      if (button.matches("[data-family-expand-all]")) {
        branches.forEach((branch) => {
          branch.open = true;
        });
        updateControls(tree, `已展开全部${branches.length}个分支`);
      }
      if (button.matches("[data-family-collapse-all]")) {
        branches.forEach((branch) => {
          branch.open = false;
        });
        updateControls(tree, "已收起全部分支");
      }
    });
    tree.addEventListener(
      "toggle",
      (event) => {
        if (event.target.matches?.("details[data-family-branch]")) updateControls(tree);
      },
      true,
    );
    updateControls(tree, initialMessage);
  }

  function loadStyles(tree) {
    if (!tree.hasAttribute("data-family-load-styles")) return;
    if (document.querySelector("link[data-li-family-tree-styles]")) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL("family-tree.css", assetBase).href;
    stylesheet.dataset.liFamilyTreeStyles = "";
    document.head.append(stylesheet);
  }

  function sourceUrlFor(tree) {
    const configured = tree.dataset.familySource;
    return configured ? new URL(configured, document.baseURI) : new URL("family-tree.json", assetBase);
  }

  function resolveFocus(tree, documentData, people) {
    const configuredFocus = tree.dataset.familyFocusPerson || documentData.defaultFocusPersonId;
    if (!tree.hasAttribute("data-family-allow-query")) return configuredFocus;
    const queryFocus = new URLSearchParams(window.location.search).get("person");
    return queryFocus && people.has(queryFocus) ? queryFocus : configuredFocus;
  }

  async function refreshTree(tree) {
    loadStyles(tree);
    tree.dataset.enhanced = "true";
    enhanceControls(tree, tree.querySelector("[data-family-tree-status]")?.textContent);

    const sourceUrl = sourceUrlFor(tree);
    sourceUrl.searchParams.set("v", String(Math.floor(Date.now() / 60000)));
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Family data returned ${response.status}`);
    const documentData = await response.json();
    assertFamilyDocument(documentData);

    const people = collectPeople(documentData.root);
    const focusPersonId = resolveFocus(tree, documentData, people);
    const hasQueryFocus =
      tree.hasAttribute("data-family-allow-query") &&
      new URLSearchParams(window.location.search).has("person") &&
      people.has(new URLSearchParams(window.location.search).get("person"));
    const expandAllByDefault = tree.dataset.familyDefaultExpand === "all" && !hasQueryFocus;
    const expandedIds = expandAllByDefault
      ? expandedAll(documentData.root)
      : expandedPath(documentData.root, focusPersonId);
    const showProfileLinks = tree.dataset.familyProfileLinks !== "false";
    const root = tree.querySelector("[data-family-root]");
    if (!root) throw new Error("Family tree root is missing");
    root.replaceChildren(
      renderBranch(
        documentData.root,
        expandedIds,
        tree.dataset.familyTreeId || documentData.treeId,
        showProfileLinks,
      ),
    );

    const updated = document.querySelector("[data-family-updated]");
    if (updated) {
      const [year, month, day] = documentData.updatedAt.split("-");
      updated.textContent = `${year}年${Number(month)}月${Number(day)}日更新`;
    }
    const focusedName = people.get(focusPersonId)?.name;
    const initialMessage = hasQueryFocus
      ? `已定位到${focusedName}`
      : expandAllByDefault
        ? "默认展开全部家人"
        : `默认展开${focusedName}所在的一支`;
    updateControls(tree, initialMessage);

    if (hasQueryFocus) {
      requestAnimationFrame(() => {
        tree
          .querySelector(`[data-family-person-id="${CSS.escape(focusPersonId)}"]`)
          ?.scrollIntoView({ block: "center", inline: "center" });
      });
    }
    tree.dispatchEvent(
      new CustomEvent("li-family-tree:ready", {
        bubbles: true,
        detail: { document: documentData, focusPersonId },
      }),
    );
  }

  function start() {
    document.querySelectorAll("[data-family-interactive-tree]").forEach((tree) => {
      refreshTree(tree).catch(() => {
        tree.dataset.enhanced = "true";
        enhanceControls(tree, "正在显示页面保存的族谱版本");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

