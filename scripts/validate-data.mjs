import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dataUrl = new URL("../public/family-tree.json", import.meta.url);
const forbiddenPhrases = ["信息不公开", "家人口述补名", "存活排行"];

export function validateFamilyDocument(document) {
  const errors = [];
  const nodeIds = new Set();
  const personIds = new Set();
  const personNames = [];
  let nodeCount = 0;
  let personCount = 0;
  let expandableCount = 0;

  if (document?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  for (const field of ["treeId", "title", "subtitle", "updatedAt", "revision", "intro"]) {
    if (typeof document?.[field] !== "string" || !document[field].trim()) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document?.updatedAt ?? "")) {
    errors.push("updatedAt must use YYYY-MM-DD");
  }
  if (!document?.root) errors.push("root is required");

  function visit(node, ancestry = new Set()) {
    if (!node || typeof node !== "object") {
      errors.push("every node must be an object");
      return;
    }
    if (ancestry.has(node)) {
      errors.push(`cycle detected at ${node.id ?? "unknown node"}`);
      return;
    }
    nodeCount += 1;
    if (typeof node.id !== "string" || !node.id.trim()) {
      errors.push("every node requires an id");
    } else if (nodeIds.has(node.id)) {
      errors.push(`duplicate node id: ${node.id}`);
    } else {
      nodeIds.add(node.id);
    }
    if (!Array.isArray(node.people) || node.people.length === 0) {
      errors.push(`node ${node.id ?? "unknown"} requires at least one person`);
    }
    for (const person of node.people ?? []) {
      personCount += 1;
      for (const field of ["id", "relation", "name"]) {
        if (typeof person[field] !== "string" || !person[field].trim()) {
          errors.push(`person in ${node.id ?? "unknown"} requires ${field}`);
        }
      }
      if (personIds.has(person.id)) errors.push(`duplicate person id: ${person.id}`);
      personIds.add(person.id);
      personNames.push(person.name);
      if (person.href && !/^https:\/\//.test(person.href)) {
        errors.push(`person ${person.id} href must use https`);
      }
    }
    if (node.children !== undefined && !Array.isArray(node.children)) {
      errors.push(`children for ${node.id ?? "unknown"} must be an array`);
    }
    if (node.children?.length) expandableCount += 1;
    const nextAncestry = new Set(ancestry).add(node);
    for (const child of node.children ?? []) visit(child, nextAncestry);
  }

  if (document?.root) visit(document.root);

  for (const relationship of document?.relationships ?? []) {
    if (typeof relationship.id !== "string" || !relationship.id.trim()) {
      errors.push("every relationship requires an id");
    }
    if (relationship.type !== "twin") {
      errors.push(`unsupported relationship type: ${relationship.type}`);
    }
    if (!Array.isArray(relationship.people) || relationship.people.length !== 2) {
      errors.push(`relationship ${relationship.id ?? "unknown"} must reference two people`);
    }
    for (const personId of relationship.people ?? []) {
      if (!personIds.has(personId)) {
        errors.push(`relationship ${relationship.id ?? "unknown"} references unknown person ${personId}`);
      }
    }
    if (relationship.olderPersonId && !relationship.people?.includes(relationship.olderPersonId)) {
      errors.push(`relationship ${relationship.id ?? "unknown"} has an invalid olderPersonId`);
    }
  }

  const serialized = JSON.stringify(document);
  for (const phrase of forbiddenPhrases) {
    if (serialized.includes(phrase)) errors.push(`forbidden phrase: ${phrase}`);
  }
  if (/[，。！？；：、]\s+|\s+[，。！？；：、]/u.test(serialized)) {
    errors.push("Chinese punctuation must not have adjacent ASCII whitespace");
  }

  const expectedNames = [
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
  ];
  for (const name of expectedNames) {
    if (!personNames.includes(name)) errors.push(`missing person: ${name}`);
  }
  if (nodeCount !== 10) errors.push(`expected 10 nodes, found ${nodeCount}`);
  if (personCount !== 13) errors.push(`expected 13 people, found ${personCount}`);
  if (expandableCount !== 3) errors.push(`expected 3 expandable nodes, found ${expandableCount}`);
  if (!personIds.has(document?.defaultFocusPersonId)) {
    errors.push("defaultFocusPersonId must match a person id");
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return { nodeCount, personCount, expandableCount };
}

async function main() {
  const document = JSON.parse(await readFile(dataUrl, "utf8"));
  const counts = validateFamilyDocument(document);
  console.log(
    `Validated ${counts.nodeCount} family nodes, ${counts.personCount} people, and ${counts.expandableCount} expandable branches.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
