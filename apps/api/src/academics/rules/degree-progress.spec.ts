import { computeDegreeProgress } from './degree-progress';
import type { RuleDocument } from '@ricozedu/shared-types';

describe('degree-progress', () => {
  const baseInput = () => ({
    programmeVersionId: 'pv-1',
    curriculumVersionId: 'cur-1',
    progressionRuleIds: ['pr-1'],
    requirements: [
      {
        courseVersionId: 'cv-1',
        courseId: 'c-1',
        isRequired: true,
        category: 'core',
        credits: 4,
      },
      {
        courseVersionId: 'cv-2',
        courseId: 'c-2',
        courseGroupId: 'grp-elec',
        isRequired: false,
        category: 'elective',
        credits: 3,
      },
      {
        courseVersionId: 'cv-3',
        courseId: 'c-3',
        courseGroupId: 'grp-elec',
        isRequired: false,
        category: 'elective',
        credits: 3,
      },
    ],
    groups: [
      {
        id: 'grp-elec',
        code: 'ELEC',
        name: 'Electives',
        minCredits: 3,
        minCourses: 1,
      },
    ],
    completed: [
      {
        courseVersionId: 'cv-1',
        courseId: 'c-1',
        credits: 4,
        category: 'core',
        grade: 'A',
      },
      {
        courseVersionId: 'cv-2',
        courseId: 'c-2',
        credits: 3,
        category: 'elective',
        courseGroupIds: ['grp-elec'],
        grade: 'B',
      },
    ],
    transferCredits: 0,
    waivedCourseVersionIds: [] as string[],
    exitAwards: [
      {
        code: 'CERT',
        name: 'Certificate',
        minCredits: 7,
        awardLevel: 'certificate',
      },
    ],
    totalCreditsRequired: 7,
  });

  it('computes credits, groups, and exit eligibility', () => {
    const r = computeDegreeProgress(baseInput());
    expect(r.pass).toBe(true);
    expect(r.totalCreditsEarned).toBe(7);
    expect(r.creditsByCategory.core).toBe(4);
    expect(r.groups[0]!.satisfied).toBe(true);
    expect(r.exitAwards[0]!.eligible).toBe(true);
    expect(r.ruleVersionRefs.evaluatorVersion).toBeTruthy();
    expect(r.ruleVersionRefs.programmeVersionId).toBe('pv-1');
  });

  it('reports remaining required courses', () => {
    const input = baseInput();
    input.completed = [];
    const r = computeDegreeProgress(input);
    expect(r.pass).toBe(false);
    expect(r.remainingRequiredCourses).toHaveLength(1);
    expect(r.explanation).toMatch(/required course/i);
  });

  it('honours waivers and transfer credits', () => {
    const input = baseInput();
    input.completed = [
      {
        courseVersionId: 'cv-2',
        courseId: 'c-2',
        credits: 3,
        category: 'elective',
        courseGroupIds: ['grp-elec'],
        grade: 'B',
      },
    ];
    input.waivedCourseVersionIds = ['cv-1'];
    input.transferCredits = 4;
    const r = computeDegreeProgress(input);
    expect(r.remainingRequiredCourses).toHaveLength(0);
    expect(r.totalCreditsEarned).toBe(7);
  });

  it('applies programme rules document', () => {
    const input = baseInput();
    const rules: RuleDocument = {
      version: '1',
      all: [{ type: 'credit_total', min: 100 }],
    };
    input.programmeRulesDocument = rules;
    const r = computeDegreeProgress(input);
    expect(r.pass).toBe(false);
    expect(r.explanation).toMatch(/100/i);
  });
});
