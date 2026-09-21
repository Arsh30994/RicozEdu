export interface PrerequisiteGroupInput {
  id: string;
  courseVersionId: string;
  logic: 'AND' | 'OR';
  sortOrder: number;
  items: PrerequisiteItemInput[];
}

export interface PrerequisiteItemInput {
  id: string;
  requiredCourseVersionId?: string | null;
  requiredCourseId?: string | null;
  departmentId?: string | null;
  minGrade?: string | null;
}

export interface PrerequisiteGraph {
  /** courseVersionId -> prerequisite group edges targeting other course versions */
  adjacency: Map<string, Set<string>>;
  groups: PrerequisiteGroupInput[];
  crossDepartmentEdges: Array<{
    fromCourseVersionId: string;
    departmentId: string;
    itemId: string;
  }>;
}

export interface GraphValidationResult {
  valid: boolean;
  cycles: string[][];
  explanation: string;
  crossDepartmentAllowed: boolean;
  crossDepartmentEdges: PrerequisiteGraph['crossDepartmentEdges'];
}

/**
 * Build a directed prerequisite graph from groups/items.
 * Edges point from dependent course version -> required course version.
 */
export function buildPrerequisiteGraph(
  groups: PrerequisiteGroupInput[],
): PrerequisiteGraph {
  const adjacency = new Map<string, Set<string>>();
  const crossDepartmentEdges: PrerequisiteGraph['crossDepartmentEdges'] = [];

  for (const g of groups) {
    if (!adjacency.has(g.courseVersionId)) {
      adjacency.set(g.courseVersionId, new Set());
    }
    for (const item of g.items) {
      if (item.requiredCourseVersionId) {
        adjacency.get(g.courseVersionId)!.add(item.requiredCourseVersionId);
        if (!adjacency.has(item.requiredCourseVersionId)) {
          adjacency.set(item.requiredCourseVersionId, new Set());
        }
      }
      if (item.departmentId) {
        crossDepartmentEdges.push({
          fromCourseVersionId: g.courseVersionId,
          departmentId: item.departmentId,
          itemId: item.id,
        });
      }
    }
  }

  return { adjacency, groups, crossDepartmentEdges };
}

/**
 * Detect strongly connected components with Tarjan; any SCC with size > 1
 * or a self-loop is a cycle.
 */
export function detectCycles(adjacency: Map<string, Set<string>>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  function strongConnect(v: string) {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);

      const hasSelfLoop =
        component.length === 1 && (adjacency.get(component[0]!)?.has(component[0]!) ?? false);
      if (component.length > 1 || hasSelfLoop) {
        cycles.push(component);
      }
    }
  }

  for (const v of adjacency.keys()) {
    if (!indices.has(v)) strongConnect(v);
  }
  return cycles;
}

/**
 * Validate that a set of prerequisite groups forms an acyclic graph.
 * Cross-department edges are allowed when `allowCrossDepartment` is true
 * (default true — NEP multidisciplinary pathways).
 */
export function validatePrerequisiteGraph(
  groups: PrerequisiteGroupInput[],
  options: { allowCrossDepartment?: boolean } = {},
): GraphValidationResult {
  const allowCrossDepartment = options.allowCrossDepartment ?? true;
  const graph = buildPrerequisiteGraph(groups);
  const cycles = detectCycles(graph.adjacency);

  if (cycles.length > 0) {
    return {
      valid: false,
      cycles,
      explanation: `Prerequisite cycles detected: ${cycles
        .map((c) => c.join(' ? '))
        .join('; ')}. Remove circular prerequisites before saving.`,
      crossDepartmentAllowed: allowCrossDepartment,
      crossDepartmentEdges: graph.crossDepartmentEdges,
    };
  }

  if (!allowCrossDepartment && graph.crossDepartmentEdges.length > 0) {
    return {
      valid: false,
      cycles: [],
      explanation: `Cross-department prerequisite edges are not allowed for this programme (${graph.crossDepartmentEdges.length} found).`,
      crossDepartmentAllowed: false,
      crossDepartmentEdges: graph.crossDepartmentEdges,
    };
  }

  return {
    valid: true,
    cycles: [],
    explanation: 'Prerequisite graph is valid with no cycles.',
    crossDepartmentAllowed: allowCrossDepartment,
    crossDepartmentEdges: graph.crossDepartmentEdges,
  };
}

/**
 * Evaluate whether prerequisites for a course version are satisfied given
 * completed course versions / course ids and AND/OR group logic.
 */
export function arePrerequisitesSatisfied(
  groups: PrerequisiteGroupInput[],
  courseVersionId: string,
  completed: { courseVersionIds: Set<string>; courseIds: Set<string> },
): { satisfied: boolean; explanation: string } {
  const relevant = groups
    .filter((g) => g.courseVersionId === courseVersionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (relevant.length === 0) {
    return {
      satisfied: true,
      explanation: 'This course has no prerequisite requirements.',
    };
  }

  const groupResults: boolean[] = [];
  const messages: string[] = [];

  for (const g of relevant) {
    if (g.items.length === 0) {
      groupResults.push(true);
      continue;
    }
    const itemPasses = g.items.map((item) => {
      if (item.requiredCourseVersionId) {
        return completed.courseVersionIds.has(item.requiredCourseVersionId);
      }
      if (item.requiredCourseId) {
        return completed.courseIds.has(item.requiredCourseId);
      }
      // department marker alone does not block registration eligibility here
      return true;
    });

    const pass =
      g.logic === 'AND' ? itemPasses.every(Boolean) : itemPasses.some(Boolean);
    groupResults.push(pass);
    if (!pass) {
      messages.push(
        g.logic === 'AND'
          ? `All prerequisites in group ${g.id} must be completed.`
          : `At least one prerequisite in group ${g.id} must be completed.`,
      );
    }
  }

  // All groups for a course must be satisfied (groups are ANDed)
  const satisfied = groupResults.every(Boolean);
  return {
    satisfied,
    explanation: satisfied
      ? 'All prerequisite groups are satisfied.'
      : messages.join(' '),
  };
}
