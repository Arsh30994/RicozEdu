import {
  evaluateRuleDocument,
  StudentAcademicSnapshot,
} from './rule-evaluator';
import type { RuleDocument } from '@ricozedu/shared-types';

describe('rule-evaluator', () => {
  const baseSnapshot = (): StudentAcademicSnapshot => ({
    studentMembershipId: 's1',
    completedCourses: [
      {
        courseVersionId: 'cv-math',
        courseId: 'c-math',
        grade: 'B',
        credits: 4,
        category: 'core',
      },
    ],
    groupCredits: { 'grp-1': 8 },
    creditsByCategory: { core: 4, elective: 6 },
    totalCredits: 10,
    cgpa: 3.2,
    failCount: 0,
    eligibleExitAwards: [],
  });

  it('passes empty rule document', () => {
    const doc: RuleDocument = { version: '1' };
    const r = evaluateRuleDocument(doc, baseSnapshot());
    expect(r.pass).toBe(true);
    expect(r.explanation).toMatch(/satisfied/i);
  });

  it('evaluates credit_total with categories', () => {
    const doc: RuleDocument = {
      version: '1',
      all: [{ type: 'credit_total', min: 4, categories: ['core'] }],
    };
    const r = evaluateRuleDocument(doc, baseSnapshot());
    expect(r.pass).toBe(true);

    const fail = evaluateRuleDocument(
      { version: '1', all: [{ type: 'credit_total', min: 20 }] },
      baseSnapshot(),
    );
    expect(fail.pass).toBe(false);
    expect(fail.explanation).toMatch(/need at least 20/i);
  });

  it('evaluates course_completed and waivers', () => {
    const doc: RuleDocument = {
      version: '1',
      all: [
        {
          type: 'course_completed',
          courseVersionId: 'cv-math',
          minGrade: 'C',
        },
      ],
    };
    expect(evaluateRuleDocument(doc, baseSnapshot()).pass).toBe(true);

    const waived = evaluateRuleDocument(
      {
        version: '1',
        all: [{ type: 'course_completed', courseVersionId: 'cv-phys' }],
      },
      { ...baseSnapshot(), waivedCourseVersionIds: ['cv-phys'] },
    );
    expect(waived.pass).toBe(true);
    expect(waived.explanation).toMatch(/waived/i);
  });

  it('evaluates any (OR) and not clauses', () => {
    const orDoc: RuleDocument = {
      version: '1',
      any: [
        { type: 'credit_total', min: 100 },
        { type: 'group_credits', courseGroupId: 'grp-1', minCredits: 8 },
      ],
    };
    expect(evaluateRuleDocument(orDoc, baseSnapshot()).pass).toBe(true);

    const notDoc: RuleDocument = {
      version: '1',
      not: { type: 'term_standing', maxFailCount: 0 },
    };
    // failCount is 0 so term_standing with maxFailCount 0 passes ? not fails
    const r = evaluateRuleDocument(notDoc, baseSnapshot());
    expect(r.pass).toBe(false);
    expect(r.explanation).toMatch(/disqualifying/i);
  });

  it('evaluates exit_eligible and term_standing', () => {
    const snap = {
      ...baseSnapshot(),
      eligibleExitAwards: ['CERT'],
      failCount: 3,
      cgpa: 2.0,
    };
    expect(
      evaluateRuleDocument(
        { version: '1', all: [{ type: 'exit_eligible', exitAwardCode: 'CERT' }] },
        snap,
      ).pass,
    ).toBe(true);

    const standing = evaluateRuleDocument(
      {
        version: '1',
        all: [{ type: 'term_standing', minCgpa: 2.5, maxFailCount: 1 }],
      },
      snap,
    );
    expect(standing.pass).toBe(false);
    expect(standing.explanation).toMatch(/CGPA/i);
  });
});
