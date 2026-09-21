import { simulateCurriculumChange } from './simulation-engine';
import type { CurriculumSnapshot, StudentCurriculumSnapshot } from './simulation-engine';

describe('simulation engine', () => {
  it('reports newly required courses as eligibility impact', () => {
    const published: CurriculumSnapshot = {
      programmeVersionId: 'pv1',
      curriculumVersionId: 'cur1',
      requirements: [
        {
          courseVersionId: 'cv1',
          courseId: 'c1',
          category: 'core',
          credits: 4,
          isRequired: true,
        },
      ],
      groups: [],
      exitAwards: [],
      totalCreditsRequired: 4,
    };
    const draft: CurriculumSnapshot = {
      ...published,
      curriculumVersionId: 'cur2',
      requirements: [
        ...published.requirements,
        {
          courseVersionId: 'cv9',
          courseId: 'c9',
          category: 'core',
          credits: 4,
          isRequired: true,
        },
      ],
      totalCreditsRequired: 8,
    };
    const students: StudentCurriculumSnapshot[] = [
      {
        studentMembershipId: 's1',
        completed: [],
        transferCredits: 0,
        waivedCourseVersionIds: [],
      },
    ];
    const result = simulateCurriculumChange(published, draft, students);
    expect(result.affectedStudentsCount).toBeGreaterThanOrEqual(1);
    expect(result.summaryExplanation).toMatch(/affected|No enrolled/i);
    expect(result.summaryExplanation).toMatch(/never recalculated/i);
  });
});
