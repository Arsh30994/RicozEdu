import {
  arePrerequisitesSatisfied,
  PrerequisiteGroupInput,
} from './prerequisite-graph';

export interface RegistrationCheckInput {
  courseVersionId: string;
  courseCode?: string;
  courseTitle?: string;
  creditValue: number;
  maxCreditsThisTerm?: number | null;
  currentTermCredits: number;
  prerequisiteGroups: PrerequisiteGroupInput[];
  corequisiteCourseVersionIds: string[];
  /** Courses already completed or currently registered this term (for coreqs) */
  completedCourseVersionIds: string[];
  completedCourseIds: string[];
  registeredThisTermCourseVersionIds: string[];
  waivedCourseVersionIds?: string[];
}

export interface RegistrationCheckResult {
  eligible: boolean;
  explanation: string;
  failures: string[];
  details: Record<string, unknown>;
}

/**
 * Produce human-language registration eligibility explanations
 * for missing prerequisites, corequisites, or credit limits.
 */
export function explainRegistrationEligibility(
  input: RegistrationCheckInput,
): RegistrationCheckResult {
  const failures: string[] = [];
  const courseLabel =
    input.courseCode && input.courseTitle
      ? `${input.courseCode} (${input.courseTitle})`
      : input.courseCode ?? input.courseVersionId;

  const waived = new Set(input.waivedCourseVersionIds ?? []);
  if (waived.has(input.courseVersionId)) {
    return {
      eligible: true,
      explanation: `${courseLabel} is waived for this student, so registration rules do not apply.`,
      failures: [],
      details: { waived: true },
    };
  }

  const completedVersions = new Set([
    ...input.completedCourseVersionIds,
    ...input.registeredThisTermCourseVersionIds,
  ]);
  const completedCourses = new Set(input.completedCourseIds);

  const prereq = arePrerequisitesSatisfied(
    input.prerequisiteGroups,
    input.courseVersionId,
    { courseVersionIds: completedVersions, courseIds: completedCourses },
  );
  if (!prereq.satisfied) {
    failures.push(
      `You cannot register for ${courseLabel} because prerequisites are incomplete. ${prereq.explanation}`,
    );
  }

  for (const coreqId of input.corequisiteCourseVersionIds) {
    const ok =
      completedVersions.has(coreqId) ||
      input.registeredThisTermCourseVersionIds.includes(coreqId);
    if (!ok) {
      failures.push(
        `You must also register for (or have completed) corequisite course ${coreqId} when taking ${courseLabel}.`,
      );
    }
  }

  if (
    input.maxCreditsThisTerm != null &&
    input.currentTermCredits + input.creditValue > Number(input.maxCreditsThisTerm)
  ) {
    failures.push(
      `Registering for ${courseLabel} (${input.creditValue} credits) would exceed the term credit limit of ${input.maxCreditsThisTerm}. You currently have ${input.currentTermCredits} credits this term.`,
    );
  }

  const eligible = failures.length === 0;
  return {
    eligible,
    explanation: eligible
      ? `You are eligible to register for ${courseLabel}.`
      : failures.join(' '),
    failures,
    details: {
      courseVersionId: input.courseVersionId,
      prerequisiteSatisfied: prereq.satisfied,
      corequisiteCount: input.corequisiteCourseVersionIds.length,
    },
  };
}
