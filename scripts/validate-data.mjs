import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dataUrl = new URL("../public/family-tree.json", import.meta.url);
const forbiddenPhrases = ["信息不公开", "家人口述补名", "存活排行"];

function isNonEmptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function validateReference(reference, context, errors, referencedPersonIds) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    errors.push(`${context} must be an object`);
    return;
  }
  for (const field of ["personId", "relation"]) {
    if (!isNonEmptyString(reference[field])) {
      errors.push(`${context} requires ${field}`);
    }
  }
  if (isNonEmptyString(reference.personId)) referencedPersonIds.add(reference.personId);
  if (reference.note !== undefined && typeof reference.note !== "string") {
    errors.push(`${context} note must be a string`);
  }
}

export function validateFamilyDocument(document) {
  const errors = [];
  const personIds = new Set();
  const familyIds = new Set();
  const groupIds = new Set();
  const relationshipIds = new Set();
  const referencedPersonIds = new Set();
  const formedFamilyByPerson = new Map();
  const parentFamilyByPerson = new Map();
  const childReferencesByFamily = new Map();

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("family document must be an object");
  }
  if (document.schemaVersion !== 2) errors.push("schemaVersion must be 2");
  for (const field of [
    "treeId",
    "title",
    "subtitle",
    "updatedAt",
    "revision",
    "intro",
    "defaultFocusPersonId",
    "focusFamilyId",
  ]) {
    if (!isNonEmptyString(document[field])) errors.push(`${field} must be a non-empty string`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document.updatedAt ?? "")) {
    errors.push("updatedAt must use YYYY-MM-DD");
  }

  const people = Array.isArray(document.people) ? document.people : [];
  if (!Array.isArray(document.people) || people.length === 0) {
    errors.push("people must be a non-empty array");
  }
  for (const [index, person] of people.entries()) {
    const context = `person at index ${index}`;
    if (!person || typeof person !== "object" || Array.isArray(person)) {
      errors.push(`${context} must be an object`);
      continue;
    }
    for (const field of ["id", "name"]) {
      if (!isNonEmptyString(person[field])) errors.push(`${context} requires ${field}`);
    }
    if (isNonEmptyString(person.id)) {
      if (personIds.has(person.id)) errors.push(`duplicate person id: ${person.id}`);
      personIds.add(person.id);
    }
    if (person.note !== undefined && typeof person.note !== "string") {
      errors.push(`person ${person.id ?? index} note must be a string`);
    }
    if (person.href !== undefined && !/^https:\/\//.test(person.href)) {
      errors.push(`person ${person.id ?? index} href must use https`);
    }
  }

  const families = Array.isArray(document.families) ? document.families : [];
  if (!Array.isArray(document.families) || families.length === 0) {
    errors.push("families must be a non-empty array");
  }
  for (const [familyIndex, family] of families.entries()) {
    const familyContext = `family at index ${familyIndex}`;
    if (!family || typeof family !== "object" || Array.isArray(family)) {
      errors.push(`${familyContext} must be an object`);
      continue;
    }
    if (!isNonEmptyString(family.id)) {
      errors.push(`${familyContext} requires id`);
    } else {
      if (familyIds.has(family.id)) errors.push(`duplicate family id: ${family.id}`);
      familyIds.add(family.id);
    }

    const partners = Array.isArray(family.partners) ? family.partners : [];
    if (!Array.isArray(family.partners) || partners.length === 0) {
      errors.push(`family ${family.id ?? familyIndex} partners must be a non-empty array`);
    }
    if (partners.length > 2) {
      errors.push(`family ${family.id ?? familyIndex} cannot have more than two partners`);
    }
    const partnerIds = new Set();
    for (const [partnerIndex, partner] of partners.entries()) {
      const context = `partner ${partnerIndex} in family ${family.id ?? familyIndex}`;
      validateReference(partner, context, errors, referencedPersonIds);
      if (!isNonEmptyString(partner?.personId)) continue;
      if (partnerIds.has(partner.personId)) {
        errors.push(`duplicate partner ${partner.personId} in family ${family.id ?? familyIndex}`);
      }
      partnerIds.add(partner.personId);
      const existingFamilyId = formedFamilyByPerson.get(partner.personId);
      if (existingFamilyId && existingFamilyId !== family.id) {
        errors.push(
          `person ${partner.personId} is a partner in both ${existingFamilyId} and ${family.id}`,
        );
      } else if (isNonEmptyString(family.id)) {
        formedFamilyByPerson.set(partner.personId, family.id);
      }
    }

    const childrenGroups = family.childrenGroups ?? [];
    if (!Array.isArray(childrenGroups)) {
      errors.push(`family ${family.id ?? familyIndex} childrenGroups must be an array`);
      continue;
    }
    const familyChildIds = new Set();
    const familyChildReferences = [];
    for (const [groupIndex, group] of childrenGroups.entries()) {
      const groupContext = `children group ${groupIndex} in family ${family.id ?? familyIndex}`;
      if (!group || typeof group !== "object" || Array.isArray(group)) {
        errors.push(`${groupContext} must be an object`);
        continue;
      }
      for (const field of ["id", "label"]) {
        if (!isNonEmptyString(group[field])) errors.push(`${groupContext} requires ${field}`);
      }
      if (isNonEmptyString(group.id)) {
        if (groupIds.has(group.id)) errors.push(`duplicate children group id: ${group.id}`);
        groupIds.add(group.id);
      }
      if (typeof group.ordered !== "boolean") {
        errors.push(`${groupContext} ordered must be a boolean`);
      }
      const children = Array.isArray(group.children) ? group.children : [];
      if (!Array.isArray(group.children) || children.length === 0) {
        errors.push(`${groupContext} children must be a non-empty array`);
      }
      for (const [childIndex, child] of children.entries()) {
        const context = `child ${childIndex} in group ${group.id ?? groupIndex}`;
        validateReference(child, context, errors, referencedPersonIds);
        if (!isNonEmptyString(child?.personId)) continue;
        if (familyChildIds.has(child.personId)) {
          errors.push(`duplicate child ${child.personId} in family ${family.id ?? familyIndex}`);
        }
        familyChildIds.add(child.personId);
        const existingParentFamilyId = parentFamilyByPerson.get(child.personId);
        if (existingParentFamilyId && existingParentFamilyId !== family.id) {
          errors.push(
            `person ${child.personId} is a child in both ${existingParentFamilyId} and ${family.id}`,
          );
        } else if (isNonEmptyString(family.id)) {
          parentFamilyByPerson.set(child.personId, family.id);
        }
        familyChildReferences.push(child.personId);
      }
    }
    if (isNonEmptyString(family.id)) childReferencesByFamily.set(family.id, familyChildReferences);
  }

  for (const personId of referencedPersonIds) {
    if (!personIds.has(personId)) errors.push(`unknown person reference: ${personId}`);
  }

  const rootFamilyIds = Array.isArray(document.rootFamilyIds) ? document.rootFamilyIds : [];
  if (!Array.isArray(document.rootFamilyIds) || rootFamilyIds.length === 0) {
    errors.push("rootFamilyIds must be a non-empty array");
  }
  const uniqueRootFamilyIds = new Set();
  for (const [index, familyId] of rootFamilyIds.entries()) {
    if (!isNonEmptyString(familyId)) {
      errors.push(`rootFamilyIds[${index}] must be a non-empty string`);
      continue;
    }
    if (uniqueRootFamilyIds.has(familyId)) errors.push(`duplicate root family id: ${familyId}`);
    uniqueRootFamilyIds.add(familyId);
    if (!familyIds.has(familyId)) errors.push(`unknown root family: ${familyId}`);
  }
  if (isNonEmptyString(document.focusFamilyId) && !familyIds.has(document.focusFamilyId)) {
    errors.push(`unknown focusFamilyId: ${document.focusFamilyId}`);
  }
  if (isNonEmptyString(document.defaultFocusPersonId) && !personIds.has(document.defaultFocusPersonId)) {
    errors.push(`unknown defaultFocusPersonId: ${document.defaultFocusPersonId}`);
  }

  const familyEdges = new Map([...familyIds].map((familyId) => [familyId, new Set()]));
  for (const [familyId, childPersonIds] of childReferencesByFamily) {
    for (const personId of childPersonIds) {
      const formedFamilyId = formedFamilyByPerson.get(personId);
      if (!formedFamilyId) continue;
      if (formedFamilyId === familyId) {
        errors.push(`family ${familyId} lists its own partner ${personId} as a child`);
        continue;
      }
      familyEdges.get(familyId)?.add(formedFamilyId);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visitFamily(familyId) {
    if (visiting.has(familyId)) {
      errors.push(`family cycle detected at ${familyId}`);
      return;
    }
    if (visited.has(familyId)) return;
    visiting.add(familyId);
    for (const childFamilyId of familyEdges.get(familyId) ?? []) visitFamily(childFamilyId);
    visiting.delete(familyId);
    visited.add(familyId);
  }
  for (const familyId of familyIds) visitFamily(familyId);

  const reachableFamilyIds = new Set();
  function markReachable(familyId) {
    if (!familyIds.has(familyId) || reachableFamilyIds.has(familyId)) return;
    reachableFamilyIds.add(familyId);
    for (const childFamilyId of familyEdges.get(familyId) ?? []) markReachable(childFamilyId);
  }
  for (const familyId of uniqueRootFamilyIds) markReachable(familyId);
  for (const familyId of familyIds) {
    if (!reachableFamilyIds.has(familyId)) errors.push(`family is unreachable from roots: ${familyId}`);
  }
  for (const personId of personIds) {
    if (!referencedPersonIds.has(personId)) errors.push(`person is not used by any family: ${personId}`);
  }

  const relationships = document.relationships ?? [];
  if (!Array.isArray(relationships)) {
    errors.push("relationships must be an array");
  } else {
    for (const [index, relationship] of relationships.entries()) {
      const context = `relationship at index ${index}`;
      if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
        errors.push(`${context} must be an object`);
        continue;
      }
      if (!isNonEmptyString(relationship.id)) {
        errors.push(`${context} requires id`);
      } else {
        if (relationshipIds.has(relationship.id)) {
          errors.push(`duplicate relationship id: ${relationship.id}`);
        }
        relationshipIds.add(relationship.id);
      }
      if (relationship.type !== "twin") {
        errors.push(`unsupported relationship type: ${relationship.type}`);
      }
      const relationshipPeopleList = Array.isArray(relationship.people)
        ? relationship.people
        : [];
      if (!Array.isArray(relationship.people) || relationshipPeopleList.length !== 2) {
        errors.push(`relationship ${relationship.id ?? index} must reference two people`);
      }
      const relationshipPeople = new Set();
      for (const personId of relationshipPeopleList) {
        if (!isNonEmptyString(personId)) {
          errors.push(`relationship ${relationship.id ?? index} has an invalid person reference`);
          continue;
        }
        if (relationshipPeople.has(personId)) {
          errors.push(`relationship ${relationship.id ?? index} repeats person ${personId}`);
        }
        relationshipPeople.add(personId);
        if (!personIds.has(personId)) {
          errors.push(`relationship ${relationship.id ?? index} references unknown person ${personId}`);
        }
      }
      if (
        relationship.olderPersonId !== undefined &&
        !relationshipPeopleList.includes(relationship.olderPersonId)
      ) {
        errors.push(`relationship ${relationship.id ?? index} has an invalid olderPersonId`);
      }
    }
  }

  const serialized = JSON.stringify(document);
  for (const phrase of forbiddenPhrases) {
    if (serialized.includes(phrase)) errors.push(`forbidden phrase: ${phrase}`);
  }
  if (/[，。！？；：、]\s+|\s+[，。！？；：、]/u.test(serialized)) {
    errors.push("Chinese punctuation must not have adjacent ASCII whitespace");
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return {
    personCount: personIds.size,
    familyCount: familyIds.size,
    rootFamilyCount: uniqueRootFamilyIds.size,
    relationshipCount: relationshipIds.size,
  };
}

async function main() {
  const document = JSON.parse(await readFile(dataUrl, "utf8"));
  const counts = validateFamilyDocument(document);
  console.log(
    `Validated ${counts.personCount} people, ${counts.familyCount} families, ${counts.rootFamilyCount} roots, and ${counts.relationshipCount} relationships.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
