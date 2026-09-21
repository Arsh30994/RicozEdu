import {
  computeDegreeProgress,
  CurriculumRequirement,
  CourseGroupDef,
  DegreeProgressResult,
  ExitAwardDef,
} from '../rules/degree-progress';
import type { CompletedCourse } from '../rules/rule-evaluator';
import type { RuleDocument } from '@ricozedu/shared-types';

export interface StudentCurriculumSnapshot {
  studentMembershipId: string;
  completed: CompletedCourse[];
  transferCredits: number;
  waivedCourseVersionIds: string[];
  cgpa?: number | null;
  failCount?: number;
}

export interface CurriculumSnapshot {
  programmeVersionId: string;
  curriculumVersionId: string;
  requirements: CurriculumRequirement[];
  groups: CourseGroupDef[];
  exitAwards: ExitAwardDef[];
  totalCreditsRequired?: number | null;
  programmeRulesDocument?: RuleDocument | null;
  progressionRuleIds?: string[];
}

export interface StudentEligibilityDelta {
  studentMembershipId: string;
  published: { pass: boolean; explanation: string; totalCreditsEarned: number };
  draft: { pass: boolean; explanation: string; totalCreditsEarned: number };
  eligibilityChanged: boolean;
  becameIneligible: boolean;
  becameEligible: boolean;
  remainingRequiredDelta: number;
}

export interface SimulationResult {
  affectedStudentsCount: number;
  eligibilityLossCount: number;
  eligibilityGainCount: number;
  unchangedCount: number;
  deltas: StudentEligibilityDelta[];
  summaryExplanation: string;
}

function progressSummary(r: DegreeProgressResult) {
  return {
    pass: r.pass,
    explanation: r.explanation,
    totalCreditsEarned: r.totalCreditsEarned,
  };
}

/**
 * Compare draft curriculum vs published curriculum for enrolled students.
 * Pure function — callers supply snapshots; no I/O.
 * Never recalculates published results.
 */
export function simulateCurriculumChange(
  published: CurriculumSnapshot,
  draft: CurriculumSnapshot,
  students: StudentCurriculumSnapshot[],
): SimulationResult {
  const deltas: StudentEligibilityDelta[] = [];

  for (const s of students) {
    const pub = computeDegreeProgress({
      programmeVersionId: published.programmeVersionId,
      curriculumVersionId: published.curriculumVersionId,
      progressionRuleIds: published.progressionRuleIds,
      requirements: published.requirements,
      groups: published.groups,
      completed: s.completed,
      transferCredits: s.transferCredits,
      waivedCourseVersionIds: s.waivedCourseVersionIds,
      exitAwards: published.exitAwards,
      totalCreditsRequired: published.totalCreditsRequired,
      cgpa: s.cgpa,
      failCount: s.failCount,
      programmeRulesDocument: published.programmeRulesDocument,
    });

    const dr = computeDegreeProgress({
      programmeVersionId: draft.programmeVersionId,
      curriculumVersionId: draft.curriculumVersionId,
      progressionRuleIds: draft.progressionRuleIds,
      requirements: draft.requirements,
      groups: draft.groups,
      completed: s.completed,
      transferCredits: s.transferCredits,
      waivedCourseVersionIds: s.waivedCourseVersionIds,
      exitAwards: draft.exitAwards,
      totalCreditsRequired: draft.totalCreditsRequired,
      cgpa: s.cgpa,
      failCount: s.failCount,
      programmeRulesDocument: draft.programmeRulesDocument,
    });

    const eligibilityChanged = pub.pass !== dr.pass;
    const becameIneligible = pub.pass && !dr.pass;
    const becameEligible = !pub.pass && dr.pass;
    const remainingRequiredDelta =
      dr.remainingRequiredCourses.length - pub.remainingRequiredCourses.length;

    if (
      eligibilityChanged ||
      remainingRequiredDelta !== 0 ||
      pub.explanation !== dr.explanation
    ) {
      deltas.push({
        studentMembershipId: s.studentMembershipId,
        published: progressSummary(pub),
        draft: progressSummary(dr),
        eligibilityChanged,
        becameIneligible,
        becameEligible,
        remainingRequiredDelta,
      });
    }
  }

  const eligibilityLossCount = deltas.filter((d) => d.becameIneligible).length;
  const eligibilityGainCount = deltas.filter((d) => d.becameEligible).length;
  const unchangedCount = students.length - deltas.length;

  return {
    affectedStudentsCount: deltas.length,
    eligibilityLossCount,
    eligibilityGainCount,
    unchangedCount,
    deltas,
    summaryExplanation:
      deltas.length === 0
        ? 'No enrolled students would be affected by publishing this curriculum draft. Published results are never recalculated.'
        : `Publishing this curriculum draft would affect ${deltas.length} student(s): ${eligibilityLossCount} would lose eligibility, ${eligibilityGainCount} would gain eligibility, and ${unchangedCount} remain unchanged. Published results are never recalculated.`,
  };
}

/** @deprecated use simulateCurriculumChange */
export function runCurriculumSimulation() {
  throw new Error('Use simulateCurriculumChange');
}
