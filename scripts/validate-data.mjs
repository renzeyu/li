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

function validateMigrationMap(map, errors, stopPlaceReferences) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    errors.push("migration map must be an object");
    return;
  }
  for (const field of ["title", "intro", "styleUrl", "coordinateSystem", "researchNote"]) {
    if (!isNonEmptyString(map[field])) errors.push(`migration map requires ${field}`);
  }
  if (map.coordinateSystem !== "WGS84") {
    errors.push("migration map coordinateSystem must be WGS84");
  }
  try {
    if (new URL(map.styleUrl).protocol !== "https:") {
      errors.push("migration map styleUrl must use https");
    }
  } catch {
    errors.push("migration map styleUrl must be a valid URL");
  }

  const places = Array.isArray(map.places) ? map.places : [];
  if (!Array.isArray(map.places) || places.length === 0) {
    errors.push("migration map places must be a non-empty array");
  }
  const placeIds = new Set();
  const locatedPlaceIds = new Set();
  for (const [index, place] of places.entries()) {
    const context = `migration map place at index ${index}`;
    if (!place || typeof place !== "object" || Array.isArray(place)) {
      errors.push(`${context} must be an object`);
      continue;
    }
    for (const field of ["id", "name", "locationStatus", "coordinateNote"]) {
      if (!isNonEmptyString(place[field])) errors.push(`${context} requires ${field}`);
    }
    if (isNonEmptyString(place.id)) {
      if (placeIds.has(place.id)) errors.push(`duplicate migration map place id: ${place.id}`);
      placeIds.add(place.id);
    }
    if (!['located', 'regional-anchor', 'unlocated'].includes(place.locationStatus)) {
      errors.push(`${context} has invalid locationStatus`);
    }

    const hasCoordinates =
      Array.isArray(place.coordinates) &&
      place.coordinates.length === 2 &&
      place.coordinates.every(Number.isFinite);
    if (place.locationStatus === "located" || place.locationStatus === "regional-anchor") {
      if (!hasCoordinates) {
        errors.push(`${context} requires WGS84 coordinates`);
      } else {
        const [longitude, latitude] = place.coordinates;
        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
          errors.push(`${context} coordinates are outside WGS84 bounds`);
        }
        locatedPlaceIds.add(place.id);
      }
      if (!isNonEmptyString(place.coordinateSource)) {
        errors.push(`${context} requires coordinateSource`);
      }
    } else if (place.coordinates !== undefined) {
      errors.push(`${context} cannot include coordinates while unlocated`);
    }
  }
  if (locatedPlaceIds.size < 2) errors.push("migration map requires at least two located places");

  for (const { placeId, context } of stopPlaceReferences) {
    if (!placeIds.has(placeId)) errors.push(`${context} references unknown map place ${placeId}`);
  }
  const referencedByStops = new Set(stopPlaceReferences.map(({ placeId }) => placeId));
  for (const placeId of placeIds) {
    if (!referencedByStops.has(placeId)) {
      errors.push(`migration map place ${placeId} is not referenced by a migration stop`);
    }
  }

  const views = Array.isArray(map.views) ? map.views : [];
  if (!Array.isArray(map.views) || views.length === 0) {
    errors.push("migration map views must be a non-empty array");
  }
  const viewIds = new Set();
  for (const [index, view] of views.entries()) {
    const context = `migration map view at index ${index}`;
    if (!view || typeof view !== "object" || Array.isArray(view)) {
      errors.push(`${context} must be an object`);
      continue;
    }
    for (const field of ["id", "label"]) {
      if (!isNonEmptyString(view[field])) errors.push(`${context} requires ${field}`);
    }
    if (isNonEmptyString(view.id)) {
      if (viewIds.has(view.id)) errors.push(`duplicate migration map view id: ${view.id}`);
      viewIds.add(view.id);
    }
    if (!Number.isFinite(view.maxZoom) || view.maxZoom <= 0) {
      errors.push(`${context} requires a positive maxZoom`);
    }
    const ids = Array.isArray(view.placeIds) ? view.placeIds : [];
    if (!Array.isArray(view.placeIds) || ids.length === 0) {
      errors.push(`${context} placeIds must be a non-empty array`);
    }
    const uniqueIds = new Set();
    for (const placeId of ids) {
      if (!isNonEmptyString(placeId)) {
        errors.push(`${context} has an invalid place id`);
        continue;
      }
      if (uniqueIds.has(placeId)) errors.push(`${context} repeats place ${placeId}`);
      uniqueIds.add(placeId);
      if (!locatedPlaceIds.has(placeId)) {
        errors.push(`${context} references an unlocated or unknown place ${placeId}`);
      }
    }
  }

  const routes = Array.isArray(map.routes) ? map.routes : [];
  if (!Array.isArray(map.routes) || routes.length === 0) {
    errors.push("migration map routes must be a non-empty array");
  }
  const routeIds = new Set();
  for (const [index, route] of routes.entries()) {
    const context = `migration map route at index ${index}`;
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      errors.push(`${context} must be an object`);
      continue;
    }
    for (const field of ["id", "label"]) {
      if (!isNonEmptyString(route[field])) errors.push(`${context} requires ${field}`);
    }
    if (isNonEmptyString(route.id)) {
      if (routeIds.has(route.id)) errors.push(`duplicate migration map route id: ${route.id}`);
      routeIds.add(route.id);
    }
    const ids = Array.isArray(route.placeIds) ? route.placeIds : [];
    if (!Array.isArray(route.placeIds) || ids.length < 2) {
      errors.push(`${context} requires at least two placeIds`);
    }
    const uniqueIds = new Set();
    for (const placeId of ids) {
      if (uniqueIds.has(placeId)) errors.push(`${context} repeats place ${placeId}`);
      uniqueIds.add(placeId);
      if (!locatedPlaceIds.has(placeId)) {
        errors.push(`${context} references an unlocated or unknown place ${placeId}`);
      }
    }
  }
}

function validateMigration(migration, errors, personIds) {
  if (!migration || typeof migration !== "object" || Array.isArray(migration)) {
    errors.push("migration must be an object");
    return;
  }
  for (const field of ["title", "intro"]) {
    if (!isNonEmptyString(migration[field])) errors.push(`migration requires ${field}`);
  }

  const routes = Array.isArray(migration.routes) ? migration.routes : [];
  if (!Array.isArray(migration.routes) || routes.length === 0) {
    errors.push("migration routes must be a non-empty array");
  }
  const routeIds = new Set();
  const stopIds = new Set();
  const stopPlaceReferences = [];
  for (const [routeIndex, route] of routes.entries()) {
    const routeContext = `migration route at index ${routeIndex}`;
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      errors.push(`${routeContext} must be an object`);
      continue;
    }
    for (const field of ["id", "label"]) {
      if (!isNonEmptyString(route[field])) errors.push(`${routeContext} requires ${field}`);
    }
    if (isNonEmptyString(route.id)) {
      if (routeIds.has(route.id)) errors.push(`duplicate migration route id: ${route.id}`);
      routeIds.add(route.id);
    }

    const stops = Array.isArray(route.stops) ? route.stops : [];
    if (!Array.isArray(route.stops) || stops.length === 0) {
      errors.push(`migration route ${route.id ?? routeIndex} stops must be a non-empty array`);
    }
    for (const [stopIndex, stop] of stops.entries()) {
      const stopContext = `migration stop ${stopIndex} in route ${route.id ?? routeIndex}`;
      if (!stop || typeof stop !== "object" || Array.isArray(stop)) {
        errors.push(`${stopContext} must be an object`);
        continue;
      }
      for (const field of ["id", "period", "place", "summary"]) {
        if (!isNonEmptyString(stop[field])) errors.push(`${stopContext} requires ${field}`);
      }
      if (isNonEmptyString(stop.id)) {
        if (stopIds.has(stop.id)) errors.push(`duplicate migration stop id: ${stop.id}`);
        stopIds.add(stop.id);
      }
      if (!Array.isArray(stop.placeIds) || stop.placeIds.length === 0) {
        errors.push(`${stopContext} placeIds must be a non-empty array`);
      } else {
        const stopPlaceIds = new Set();
        for (const placeId of stop.placeIds) {
          if (!isNonEmptyString(placeId)) {
            errors.push(`${stopContext} has an invalid map place id`);
            continue;
          }
          if (stopPlaceIds.has(placeId)) {
            errors.push(`${stopContext} repeats map place ${placeId}`);
          }
          stopPlaceIds.add(placeId);
          stopPlaceReferences.push({ placeId, context: stopContext });
        }
      }
      if (stop.personIds === undefined) continue;
      if (!Array.isArray(stop.personIds)) {
        errors.push(`${stopContext} personIds must be an array`);
        continue;
      }
      const stopPersonIds = new Set();
      for (const personId of stop.personIds) {
        if (!isNonEmptyString(personId)) {
          errors.push(`${stopContext} has an invalid person id`);
          continue;
        }
        if (stopPersonIds.has(personId)) {
          errors.push(`${stopContext} repeats person ${personId}`);
        }
        stopPersonIds.add(personId);
        if (!personIds.has(personId)) {
          errors.push(`${stopContext} references unknown person ${personId}`);
        }
      }
    }
  }
  validateMigrationMap(migration.map, errors, stopPlaceReferences);
}

function validateHistory(history, errors, personIds) {
  if (!history || typeof history !== "object" || Array.isArray(history)) {
    errors.push("history must be an object");
    return;
  }
  for (const field of ["title", "intro"]) {
    if (!isNonEmptyString(history[field])) errors.push(`history requires ${field}`);
  }

  const sections = Array.isArray(history.sections) ? history.sections : [];
  if (!Array.isArray(history.sections) || sections.length === 0) {
    errors.push("history sections must be a non-empty array");
  }
  const sectionIds = new Set();
  for (const [sectionIndex, section] of sections.entries()) {
    const context = `history section at index ${sectionIndex}`;
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      errors.push(`${context} must be an object`);
      continue;
    }
    for (const field of ["id", "period", "title"]) {
      if (!isNonEmptyString(section[field])) errors.push(`${context} requires ${field}`);
    }
    if (isNonEmptyString(section.id)) {
      if (sectionIds.has(section.id)) errors.push(`duplicate history section id: ${section.id}`);
      sectionIds.add(section.id);
    }

    const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
    if (!Array.isArray(section.paragraphs) || paragraphs.length === 0) {
      errors.push(`${context} paragraphs must be a non-empty array`);
    }
    for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
      if (!isNonEmptyString(paragraph)) {
        errors.push(`${context} paragraph ${paragraphIndex} must be a non-empty string`);
      }
    }

    if (!Array.isArray(section.personIds) || section.personIds.length === 0) {
      errors.push(`${context} personIds must be a non-empty array`);
      continue;
    }
    const sectionPersonIds = new Set();
    for (const personId of section.personIds) {
      if (!isNonEmptyString(personId)) {
        errors.push(`${context} has an invalid person id`);
        continue;
      }
      if (sectionPersonIds.has(personId)) {
        errors.push(`${context} repeats person ${personId}`);
      }
      sectionPersonIds.add(personId);
      if (!personIds.has(personId)) {
        errors.push(`${context} references unknown person ${personId}`);
      }
    }
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

  validateHistory(document.history, errors, personIds);
  if (document.migration !== undefined) validateMigration(document.migration, errors, personIds);

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
