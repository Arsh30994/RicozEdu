import type { RuleDocument, RuleVersionRefs } from '@ricozedu/shared-types';
import {
  EVALUATOR_VERSION,
  evaluateRuleDocument,
  StudentAcademicSnapshot,
  CompletedCourse,
} from './rule-evaluator';

export interface CurriculumRequirement {
  courseVersionId: string;
  courseId: string;
  courseGroupId?: string | null;
  isRequired: boolean;
  category: string;
  credits: number;
  termIndex?: number | null;
}

export interface CourseGroupDef {
  id: string;
  code: string;
  name: string;
  minCredits?: number | null;
  maxCredits?: number | null;
  minCourses?: number | null;
  maxCourses?: number | null;
}

export interface ExitAwardDef {
  code: string;
  name: string;
  minCredits?: number | null;
  ruleDocument?: RuleDocument | null;
  awardLevel: string;
}

export interface DegreeProgressInput {
  programmeVersionId: string;
  curriculumVersionId: string;
  progressionRuleIds?: string[];
  requirements: CurriculumRequirement[];
  groups: CourseGroupDef[];
  completed: CompletedCourse[];
  transferCredits: number;
  waivedCourseVersionIds: string[];
  exitAwards: ExitAwardDef[];
  totalCreditsRequired?: number | null;
  cgpa?: number | null;
  failCount?: number;
  programmeRulesDocument?: RuleDocument | null;
}

export interface GroupSatisfaction {
  groupId: string;
  code: string;
  name: string;
  earnedCredits: number;
  completedCourses: number;
  minCredits?: number | null;
  minCourses?: number | null;
  satisfied: boolean;
  explanation: string;
}

export interface DegreeProgressResult {
  pass: boolean;
  explanation: string;
  totalCreditsEarned: number;
  creditsByCategory: Record<string, number>;
  remainingRequiredCourses: Array<{ courseVersionId: string; category: string; credits: number }>;
  groups: GroupSatisfaction[];
  exitAwards: Array<{
    code: string;
    name: string;
    awardLevel: string;
    eligible: boolean;
    explanation: string;
  }>;
  ruleVersionRefs: RuleVersionRefs;
  details: Record<string, unknown>;
}

function buildSnapshot(input: DegreeProgressInput): StudentAcademicSnapshot {
  const waived = new Set(input.waivedCourseVersionIds);
  const creditsByCategory: Record<string, number> = {};
  const groupCredits: Record<string, number> = {};

  let total = input.transferCredits;

  for (const c of input.completed) {
    total += c.credits;
    const cat = c.category ?? 'other';
    creditsByCategory[cat] = (creditsByCategory[cat] ?? 0) + c.credits;
    for (const gid of c.courseGroupIds ?? []) {
      groupCredits[gid] = (groupCredits[gid] ?? 0) + c.credits;
    }
  }

  // Attribute completed courses to requirement groups when not already tagged
  for (const req of input.requirements) {
    if (!req.courseGroupId) continue;
    const done = input.completed.find(
      (c) =>
        c.courseVersionId === req.courseVersionId ||
        (waived.has(req.courseVersionId) && c.courseVersionId === req.courseVersionId),
    );
    const isWaived = waived.has(req.courseVersionId);
    if (done || isWaived) {
      const credits = done?.credits ?? req.credits;
      groupCredits[req.courseGroupId] =
        (groupCredits[req.courseGroupId] ?? 0) + (done ? 0 : isWaived ? credits : 0);
      // If done but not tagged with group, add once
      if (done && !(done.courseGroupIds ?? []).includes(req.courseGroupId)) {
        groupCredits[req.courseGroupId] =
          (groupCredits[req.courseGroupId] ?? 0) + done.credits;
      }
    }
  }

  return {
    studentMembershipId: '',
    completedCourses: input.completed,
    groupCredits,
    creditsByCategory,
    totalCredits: total,
    cgpa: input.cgpa,
    failCount: input.failCount,
    waivedCourseVersionIds: waived,
  };
}

/**
 * Compute degree progress: credits by category, group satisfaction,
 * remaining requirements, and exit award eligibility.
 */
export function computeDegreeProgress(
  input: DegreeProgressInput,
): DegreeProgressResult {
  const snapshot = buildSnapshot(input);
  const completedVersions = new Set(
    input.completed.map((c) => c.courseVersionId),
  );
  const waived = new Set(input.waivedCourseVersionIds);

  const remainingRequiredCourses = input.requirements
    .filter(
      (r) =>
        r.isRequired &&
        !completedVersions.has(r.courseVersionId) &&
        !waived.has(r.courseVersionId),
    )
    .map((r) => ({
      courseVersionId: r.courseVersionId,
      category: r.category,
      credits: r.credits,
    }));

  const groups: GroupSatisfaction[] = input.groups.map((g) => {
    const earnedCredits = snapshot.groupCredits[g.id] ?? 0;
    const completedCourses = input.requirements.filter(
      (r) =>
        r.courseGroupId === g.id &&
        (completedVersions.has(r.courseVersionId) || waived.has(r.courseVersionId)),
    ).length;
    const creditOk =
      g.minCredits == null || earnedCredits >= Number(g.minCredits);
    const courseOk =
      g.minCourses == null || completedCourses >= Number(g.minCourses);
    const satisfied = creditOk && courseOk;
    return {
      groupId: g.id,
      code: g.code,
      name: g.name,
      earnedCredits,
      completedCourses,
      minCredits: g.minCredits,
      minCourses: g.minCourses,
      satisfied,
      explanation: satisfied
        ? `Course group ${g.name} requirements are met (${earnedCredits} credits, ${completedCourses} courses).`
        : `Course group ${g.name} is incomplete` +
          (!creditOk
            ? `: need ${g.minCredits} credits but have ${earnedCredits}`
            : '') +
          (!courseOk
            ? `: need ${g.minCourses} courses but have ${completedCourses}`
            : '') +
          `.`,
    };
  });

  const exitAwards = input.exitAwards.map((award) => {
    const creditOk =
      award.minCredits == null ||
      snapshot.totalCredits >= Number(award.minCredits);
    let ruleOk = true;
    let ruleExplanation = '';
    if (award.ruleDocument && award.ruleDocument.version === '1') {
      const evalResult = evaluateRuleDocument(award.ruleDocument, {
        ...snapshot,
        eligibleExitAwards: [],
      });
      ruleOk = evalResult.pass;
      ruleExplanation = evalResult.explanation;
    }
    const eligible = creditOk && ruleOk;
    return {
      code: award.code,
      name: award.name,
      awardLevel: award.awardLevel,
      eligible,
      explanation: eligible
        ? `You are eligible for ${award.name} (${award.code}).`
        : [
            !creditOk
              ? `You need at least ${award.minCredits} credits for ${award.name}, but currently have ${snapshot.totalCredits}.`
              : null,
            !ruleOk ? ruleExplanation : null,
          ]
            .filter(Boolean)
            .join(' ') || `Not yet eligible for ${award.name}.`,
    };
  });

  snapshot.eligibleExitAwards = exitAwards
    .filter((e) => e.eligible)
    .map((e) => e.code);

  let programmePass = remainingRequiredCourses.length === 0 && groups.every((g) => g.satisfied);
  let programmeExplanation = programmePass
    ? 'You have met all curriculum requirements for this programme version.'
    : [
        remainingRequiredCourses.length
          ? `You still need to complete ${remainingRequiredCourses.length} required course(s).`
          : null,
        ...groups.filter((g) => !g.satisfied).map((g) => g.explanation),
      ]
        .filter(Boolean)
        .join(' ');

  if (input.totalCreditsRequired != null) {
    if (snapshot.totalCredits < Number(input.totalCreditsRequired)) {
      programmePass = false;
      programmeExplanation +=
        (programmeExplanation ? ' ' : '') +
        `You need ${input.totalCreditsRequired} total credits but currently have ${snapshot.totalCredits}.`;
    }
  }

  if (input.programmeRulesDocument?.version === '1') {
    const r = evaluateRuleDocument(input.programmeRulesDocument, snapshot);
    if (!r.pass) {
      programmePass = false;
      programmeExplanation += (programmeExplanation ? ' ' : '') + r.explanation;
    }
  }

  const ruleVersionRefs: RuleVersionRefs = {
    programmeVersionId: input.programmeVersionId,
    curriculumVersionId: input.curriculumVersionId,
    progressionRuleIds: input.progressionRuleIds ?? [],
    evaluatorVersion: EVALUATOR_VERSION,
  };

  return {
    pass: programmePass,
    explanation: programmeExplanation || 'Degree progress could not be determined.',
    totalCreditsEarned: snapshot.totalCredits,
    creditsByCategory: snapshot.creditsByCategory,
    remainingRequiredCourses,
    groups,
    exitAwards,
    ruleVersionRefs,
    details: {
      transferCredits: input.transferCredits,
      waivedCount: input.waivedCourseVersionIds.length,
    },
  };
}
