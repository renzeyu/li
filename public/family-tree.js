(function () {
  "use strict";

  if (window.__LI_FAMILY_TREE_RENDERER_V2__) return;
  window.__LI_FAMILY_TREE_RENDERER_V2__ = true;

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
    if (
      !documentData ||
      documentData.schemaVersion !== 2 ||
      !Array.isArray(documentData.people) ||
      !Array.isArray(documentData.families) ||
      !Array.isArray(documentData.rootFamilyIds)
    ) {
      throw new Error("Unsupported family data");
    }
  }

  function indexFamilyDocument(documentData) {
    const people = new Map(documentData.people.map((person) => [person.id, person]));
    const families = new Map(documentData.families.map((family) => [family.id, family]));
    const formedFamilyByPerson = new Map();

    for (const family of documentData.families) {
      for (const partner of family.partners) {
        formedFamilyByPerson.set(partner.personId, family.id);
      }
    }

    return { people, families, formedFamilyByPerson };
  }

  function resolvePerson(reference, people) {
    const person = people.get(reference.personId);
    if (!person) throw new Error(`Unknown person: ${reference.personId}`);
    return {
      ...person,
      relation: reference.relation,
      note: reference.note ?? person.note,
    };
  }

  // Keep this projection in sync with src/family-graph.mjs. The normalized graph
  // remains the source of truth; the projected forest preserves the established UI.
  function materializeFamilyForest(documentData) {
    const { people, families, formedFamilyByPerson } = indexFamilyDocument(documentData);
    const expandedFamilies = new Set();

    function materializeFamily(familyId) {
      const family = families.get(familyId);
      if (!family) throw new Error(`Unknown family: ${familyId}`);
      expandedFamilies.add(familyId);

      const children = [];
      for (const group of family.childrenGroups ?? []) {
        for (const childReference of group.children) {
          const formedFamilyId = formedFamilyByPerson.get(childReference.personId);
          if (
            formedFamilyId &&
            formedFamilyId !== family.id &&
            !expandedFamilies.has(formedFamilyId)
          ) {
            children.push(materializeFamily(formedFamilyId));
            continue;
          }
          children.push({
            id: `${family.id}--${group.id}--${childReference.personId}`,
            people: [resolvePerson(childReference, people)],
            children: [],
            reference: Boolean(formedFamilyId),
          });
        }
      }

      return {
        id: family.id,
        people: family.partners.map((partner) => resolvePerson(partner, people)),
        children,
        reference: false,
      };
    }

    return documentData.rootFamilyIds.map(materializeFamily);
  }

  function expandedPath(roots, focusPersonId) {
    const expandedIds = new Set();
    let foundFocus = false;

    function visit(node) {
      let containsFocus = node.people.some((person) => person.id === focusPersonId);
      node.children?.forEach((child) => {
        if (visit(child)) containsFocus = true;
      });
      if (containsFocus && node.children?.length) expandedIds.add(node.id);
      if (containsFocus) foundFocus = true;
      return containsFocus;
    }

    roots.forEach(visit);
    if (!foundFocus) {
      roots.forEach((root) => {
        if (root.children?.length) expandedIds.add(root.id);
      });
    }
    return expandedIds;
  }

  function expandedAll(roots) {
    const ids = new Set();

    function visit(node) {
      if (node.children?.length) ids.add(node.id);
      node.children?.forEach(visit);
    }

    roots.forEach(visit);
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
    if (node.reference) branch.dataset.familyReference = "";
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

  function centerHorizontally(scroller, target) {
    if (!scroller || !target) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    scroller.scrollLeft +=
      targetRect.left + targetRect.width / 2 - (scrollerRect.left + scrollerRect.width / 2);
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

    const people = new Map(documentData.people.map((person) => [person.id, person]));
    const roots = materializeFamilyForest(documentData);
    const focusPersonId = resolveFocus(tree, documentData, people);
    const hasQueryFocus =
      tree.hasAttribute("data-family-allow-query") &&
      new URLSearchParams(window.location.search).has("person") &&
      people.has(new URLSearchParams(window.location.search).get("person"));
    const expandAllByDefault = tree.dataset.familyDefaultExpand === "all" && !hasQueryFocus;
    const expandedIds = expandAllByDefault
      ? expandedAll(roots)
      : expandedPath(roots, focusPersonId);
    const showProfileLinks = tree.dataset.familyProfileLinks !== "false";
    const root = tree.querySelector("[data-family-root]");
    if (!root) throw new Error("Family tree root is missing");
    root.replaceChildren(
      ...roots.map((familyRoot) =>
        renderBranch(
          familyRoot,
          expandedIds,
          tree.dataset.familyTreeId || documentData.treeId,
          showProfileLinks,
        ),
      ),
    );

    if (!hasQueryFocus) {
      requestAnimationFrame(() => {
        const target = expandAllByDefault
          ? tree.querySelector(
              `[data-family-node-id="${CSS.escape(documentData.rootFamilyIds[0])}"] > details > summary .family-chart-people`,
            )
          : tree.querySelector(`[data-family-person-id="${CSS.escape(focusPersonId)}"]`);
        centerHorizontally(tree.querySelector(".family-chart-scroll"), target);
      });
    }

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
