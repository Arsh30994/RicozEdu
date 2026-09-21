import { explainRegistrationEligibility } from './registration-explainer';
import type { PrerequisiteGroupInput } from './prerequisite-graph';

describe('registration-explainer', () => {
  const prereqs: PrerequisiteGroupInput[] = [
    {
      id: 'g1',
      courseVersionId: 'cv-adv',
      logic: 'AND',
      sortOrder: 0,
      items: [{ id: 'i1', requiredCourseVersionId: 'cv-intro' }],
    },
  ];

  it('explains missing prerequisites in human language', () => {
    const r = explainRegistrationEligibility({
      courseVersionId: 'cv-adv',
      courseCode: 'CS201',
      courseTitle: 'Advanced CS',
      creditValue: 4,
      currentTermCredits: 8,
      prerequisiteGroups: prereqs,
      corequisiteCourseVersionIds: [],
      completedCourseVersionIds: [],
      completedCourseIds: [],
      registeredThisTermCourseVersionIds: [],
    });
    expect(r.eligible).toBe(false);
    expect(r.explanation).toMatch(/cannot register/i);
    expect(r.explanation).toMatch(/CS201/);
    expect(r.failures.length).toBeGreaterThan(0);
  });

  it('explains missing corequisites', () => {
    const r = explainRegistrationEligibility({
      courseVersionId: 'cv-lab',
      courseCode: 'PHY101L',
      creditValue: 1,
      currentTermCredits: 0,
      prerequisiteGroups: [],
      corequisiteCourseVersionIds: ['cv-lecture'],
      completedCourseVersionIds: [],
      completedCourseIds: [],
      registeredThisTermCourseVersionIds: [],
    });
    expect(r.eligible).toBe(false);
    expect(r.explanation).toMatch(/corequisite/i);
  });

  it('explains credit limit breaches', () => {
    const r = explainRegistrationEligibility({
      courseVersionId: 'cv-x',
      courseCode: 'EL101',
      creditValue: 4,
      maxCreditsThisTerm: 12,
      currentTermCredits: 10,
      prerequisiteGroups: [],
      corequisiteCourseVersionIds: [],
      completedCourseVersionIds: [],
      completedCourseIds: [],
      registeredThisTermCourseVersionIds: [],
    });
    expect(r.eligible).toBe(false);
    expect(r.explanation).toMatch(/credit limit/i);
  });

  it('allows registration when all checks pass', () => {
    const r = explainRegistrationEligibility({
      courseVersionId: 'cv-adv',
      courseCode: 'CS201',
      courseTitle: 'Advanced CS',
      creditValue: 4,
      maxCreditsThisTerm: 20,
      currentTermCredits: 8,
      prerequisiteGroups: prereqs,
      corequisiteCourseVersionIds: ['cv-lab'],
      completedCourseVersionIds: ['cv-intro'],
      completedCourseIds: [],
      registeredThisTermCourseVersionIds: ['cv-lab'],
    });
    expect(r.eligible).toBe(true);
    expect(r.explanation).toMatch(/eligible/i);
  });
});
