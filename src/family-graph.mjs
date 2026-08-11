export function indexFamilyDocument(document) {
  const people = new Map(document.people.map((person) => [person.id, person]));
  const families = new Map(document.families.map((family) => [family.id, family]));
  const formedFamilyByPerson = new Map();

  for (const family of document.families) {
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

export function materializeFamilyForest(document) {
  const { people, families, formedFamilyByPerson } = indexFamilyDocument(document);
  const expandedFamilies = new Set();

  function materializeFamily(familyId) {
    const family = families.get(familyId);
    if (!family) throw new Error(`Unknown family: ${familyId}`);
    expandedFamilies.add(familyId);

    const children = [];
    for (const group of family.childrenGroups ?? []) {
      for (const childReference of group.children) {
        const formedFamilyId = formedFamilyByPerson.get(childReference.personId);
        if (formedFamilyId && formedFamilyId !== family.id && !expandedFamilies.has(formedFamilyId)) {
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

  return document.rootFamilyIds.map(materializeFamily);
}

export function countRenderedForest(roots) {
  let nodeCount = 0;
  let personOccurrenceCount = 0;
  let expandableCount = 0;

  function visit(node) {
    nodeCount += 1;
    personOccurrenceCount += node.people.length;
    if (node.children.length) expandableCount += 1;
    node.children.forEach(visit);
  }

  roots.forEach(visit);
  return { nodeCount, personOccurrenceCount, expandableCount };
}
