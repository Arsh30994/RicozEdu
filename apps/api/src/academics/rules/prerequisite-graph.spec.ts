import {
  arePrerequisitesSatisfied,
  buildPrerequisiteGraph,
  detectCycles,
  validatePrerequisiteGraph,
  PrerequisiteGroupInput,
} from './prerequisite-graph';

describe('prerequisite-graph', () => {
  const groups: PrerequisiteGroupInput[] = [
    {
      id: 'g1',
      courseVersionId: 'cv-b',
      logic: 'AND',
      sortOrder: 0,
      items: [
        { id: 'i1', requiredCourseVersionId: 'cv-a' },
        { id: 'i2', requiredCourseVersionId: 'cv-a2' },
      ],
    },
    {
      id: 'g2',
      courseVersionId: 'cv-c',
      logic: 'OR',
      sortOrder: 0,
      items: [
        { id: 'i3', requiredCourseVersionId: 'cv-b' },
        { id: 'i4', requiredCourseId: 'c-alt' },
      ],
    },
  ];

  it('builds adjacency from groups', () => {
    const g = buildPrerequisiteGraph(groups);
    expect(g.adjacency.get('cv-b')?.has('cv-a')).toBe(true);
    expect(g.adjacency.get('cv-c')?.has('cv-b')).toBe(true);
  });

  it('detects cycles with Tarjan', () => {
    const cyclic: PrerequisiteGroupInput[] = [
      {
        id: 'g1',
        courseVersionId: 'cv-a',
        logic: 'AND',
        sortOrder: 0,
        items: [{ id: 'i1', requiredCourseVersionId: 'cv-b' }],
      },
      {
        id: 'g2',
        courseVersionId: 'cv-b',
        logic: 'AND',
        sortOrder: 0,
        items: [{ id: 'i2', requiredCourseVersionId: 'cv-a' }],
      },
    ];
    const v = validatePrerequisiteGraph(cyclic);
    expect(v.valid).toBe(false);
    expect(v.cycles.length).toBeGreaterThan(0);
    expect(v.explanation).toMatch(/cycle/i);
  });

  it('allows acyclic graphs', () => {
    const v = validatePrerequisiteGraph(groups);
    expect(v.valid).toBe(true);
    expect(detectCycles(buildPrerequisiteGraph(groups).adjacency)).toEqual([]);
  });

  it('evaluates AND vs OR group logic', () => {
    const completed = {
      courseVersionIds: new Set(['cv-a']),
      courseIds: new Set<string>(),
    };
    const andFail = arePrerequisitesSatisfied(groups, 'cv-b', completed);
    expect(andFail.satisfied).toBe(false);

    completed.courseVersionIds.add('cv-a2');
    expect(arePrerequisitesSatisfied(groups, 'cv-b', completed).satisfied).toBe(
      true,
    );

    // OR: either cv-b or course c-alt
    expect(
      arePrerequisitesSatisfied(groups, 'cv-c', {
        courseVersionIds: new Set(),
        courseIds: new Set(['c-alt']),
      }).satisfied,
    ).toBe(true);
  });

  it('rejects cross-department edges when not allowed', () => {
    const withDept: PrerequisiteGroupInput[] = [
      {
        id: 'g1',
        courseVersionId: 'cv-x',
        logic: 'AND',
        sortOrder: 0,
        items: [{ id: 'i1', departmentId: 'dept-1' }],
      },
    ];
    const blocked = validatePrerequisiteGraph(withDept, {
      allowCrossDepartment: false,
    });
    expect(blocked.valid).toBe(false);
    expect(blocked.explanation).toMatch(/Cross-department/i);

    const allowed = validatePrerequisiteGraph(withDept, {
      allowCrossDepartment: true,
    });
    expect(allowed.valid).toBe(true);
  });
});
