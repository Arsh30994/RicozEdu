import type { RuleDocument, RuleNode } from '@ricozedu/shared-types';

export const EVALUATOR_VERSION = '1.0.0';

export interface CompletedCourse {
  courseVersionId: string;
  courseId: string;
  grade?: string | null;
  credits: number;
  category?: string;
  courseGroupIds?: string[];
}

export interface StudentAcademicSnapshot {
  studentMembershipId: string;
  completedCourses: CompletedCourse[];
  /** Credits earned per course group id */
  groupCredits: Record<string, number>;
  /** Total credits by category */
  creditsByCategory: Record<string, number>;
  totalCredits: number;
  cgpa?: number | null;
  failCount?: number;
  /** Exit award codes the student already qualifies for (precomputed or empty) */
  eligibleExitAwards?: string[];
  /** Course version ids whose prerequisites are known satisfied */
  satisfiedPrerequisites?: Set<string> | string[];
  waivedCourseVersionIds?: Set<string> | string[];
}

export interface RuleEvaluationResult {
  pass: boolean;
  explanation: string;
  details: {
    evaluatorVersion: string;
    nodeResults: Array<{ node: RuleNode; pass: boolean; explanation: string }>;
  };
}

function asSet(v?: Set<string> | string[]): Set<string> {
  if (!v) return new Set();
  return v instanceof Set ? v : new Set(v);
}

function gradeMeetsMin(actual: string | null | undefined, minGrade?: string): boolean {
  if (!minGrade) return true;
  if (!actual) return false;
  // Lexicographic letter-grade compare is insufficient; treat exact match or
  // ordered scale A+ > A > A- > B+ > B > B- > C+ > C > C- > D > F
  const order = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'P'];
  const ai = order.indexOf(actual.toUpperCase());
  const mi = order.indexOf(minGrade.toUpperCase());
  if (ai < 0 || mi < 0) return actual.toUpperCase() === minGrade.toUpperCase();
  if (actual.toUpperCase() === 'P') return true;
  return ai <= mi;
}

function evaluateNode(
  node: RuleNode,
  snapshot: StudentAcademicSnapshot,
): { pass: boolean; explanation: string } {
  const waived = asSet(snapshot.waivedCourseVersionIds);
  const satPrereq = asSet(snapshot.satisfiedPrerequisites);

  switch (node.type) {
    case 'credit_total': {
      let credits = snapshot.totalCredits;
      if (node.categories?.length) {
        credits = node.categories.reduce(
          (sum, cat) => sum + (snapshot.creditsByCategory[cat] ?? 0),
          0,
        );
      }
      const pass = credits >= node.min;
      return {
        pass,
        explanation: pass
          ? `You have earned ${credits} credits` +
            (node.categories?.length
              ? ` in ${node.categories.join(', ')}`
              : '') +
            `, meeting the minimum of ${node.min}.`
          : `You need at least ${node.min} credits` +
            (node.categories?.length
              ? ` in ${node.categories.join(', ')}`
              : '') +
            `, but currently have ${credits}.`,
      };
    }
    case 'course_completed': {
      if (node.courseVersionId && waived.has(node.courseVersionId)) {
        return {
          pass: true,
          explanation: `Course requirement was waived for this student.`,
        };
      }
      const match = snapshot.completedCourses.find((c) => {
        if (node.courseVersionId && c.courseVersionId === node.courseVersionId) {
          return gradeMeetsMin(c.grade, node.minGrade);
        }
        if (node.courseId && c.courseId === node.courseId) {
          return gradeMeetsMin(c.grade, node.minGrade);
        }
        return false;
      });
      const pass = Boolean(match);
      const target = node.courseVersionId ?? node.courseId ?? 'required course';
      return {
        pass,
        explanation: pass
          ? `Required course ${target} has been completed` +
            (node.minGrade ? ` with at least grade ${node.minGrade}` : '') +
            `.`
          : `You have not completed the required course ${target}` +
            (node.minGrade ? ` with at least grade ${node.minGrade}` : '') +
            `.`,
      };
    }
    case 'group_credits': {
      const earned = snapshot.groupCredits[node.courseGroupId] ?? 0;
      const pass = earned >= node.minCredits;
      return {
        pass,
        explanation: pass
          ? `You have earned ${earned} credits in the required course group (minimum ${node.minCredits}).`
          : `You need at least ${node.minCredits} credits in course group ${node.courseGroupId}, but currently have ${earned}.`,
      };
    }
    case 'prerequisite_satisfied': {
      const pass =
        satPrereq.has(node.courseVersionId) ||
        waived.has(node.courseVersionId) ||
        snapshot.completedCourses.some(
          (c) => c.courseVersionId === node.courseVersionId,
        );
      return {
        pass,
        explanation: pass
          ? `Prerequisites for this course are satisfied.`
          : `Prerequisites for course ${node.courseVersionId} are not yet satisfied.`,
      };
    }
    case 'term_standing': {
      const fails: string[] = [];
      if (node.minCgpa != null) {
        const cgpa = snapshot.cgpa ?? 0;
        if (cgpa < node.minCgpa) {
          fails.push(
            `Your CGPA is ${cgpa}, which is below the required minimum of ${node.minCgpa}`,
          );
        }
      }
      if (node.maxFailCount != null) {
        const failsCount = snapshot.failCount ?? 0;
        if (failsCount > node.maxFailCount) {
          fails.push(
            `You have ${failsCount} failed attempts, exceeding the allowed maximum of ${node.maxFailCount}`,
          );
        }
      }
      const pass = fails.length === 0;
      return {
        pass,
        explanation: pass
          ? `Your academic standing meets the term requirements.`
          : fails.join('. ') + '.',
      };
    }
    case 'exit_eligible': {
      const eligible = snapshot.eligibleExitAwards ?? [];
      const pass = eligible.includes(node.exitAwardCode);
      return {
        pass,
        explanation: pass
          ? `You are eligible for exit award ${node.exitAwardCode}.`
          : `You are not yet eligible for exit award ${node.exitAwardCode}.`,
      };
    }
    default: {
      const _exhaustive: never = node;
      return { pass: false, explanation: `Unknown rule type: ${JSON.stringify(_exhaustive)}` };
    }
  }
}

/**
 * Evaluate a declarative RuleDocument against a student academic snapshot.
 * Returns a human-language explanation suitable for students and staff.
 */
export function evaluateRuleDocument(
  doc: RuleDocument,
  snapshot: StudentAcademicSnapshot,
): RuleEvaluationResult {
  if (doc.version !== '1') {
    return {
      pass: false,
      explanation: `Unsupported rule document version.`,
      details: { evaluatorVersion: EVALUATOR_VERSION, nodeResults: [] },
    };
  }

  const nodeResults: RuleEvaluationResult['details']['nodeResults'] = [];
  const explanations: string[] = [];

  let allPass = true;
  if (doc.all?.length) {
    for (const node of doc.all) {
      const r = evaluateNode(node, snapshot);
      nodeResults.push({ node, ...r });
      if (!r.pass) {
        allPass = false;
        explanations.push(r.explanation);
      }
    }
  }

  let anyPass = !doc.any?.length;
  if (doc.any?.length) {
    anyPass = false;
    const anyFails: string[] = [];
    for (const node of doc.any) {
      const r = evaluateNode(node, snapshot);
      nodeResults.push({ node, ...r });
      if (r.pass) {
        anyPass = true;
      } else {
        anyFails.push(r.explanation);
      }
    }
    if (!anyPass) {
      explanations.push(
        `None of the alternative requirements were met: ${anyFails.join(' ')}`,
      );
    }
  }

  let notPass = true;
  if (doc.not) {
    const r = evaluateNode(doc.not, snapshot);
    nodeResults.push({ node: doc.not, pass: !r.pass, explanation: r.explanation });
    notPass = !r.pass;
    if (!notPass) {
      explanations.push(
        `A disqualifying condition is present: ${r.explanation}`,
      );
    }
  }

  const hasClauses = Boolean(doc.all?.length || doc.any?.length || doc.not);
  const pass = hasClauses ? allPass && anyPass && notPass : true;

  return {
    pass,
    explanation: pass
      ? 'All academic rule requirements are satisfied.'
      : explanations.join(' ') || 'Academic rule requirements are not satisfied.',
    details: {
      evaluatorVersion: EVALUATOR_VERSION,
      nodeResults,
    },
  };
}
