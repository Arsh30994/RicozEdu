/**
 * Deterministic grade / GPA calculation engine.
 * EVALUATOR_VERSION is stored on every calculation (rule 6).
 */

export const ASSESSMENT_EVALUATOR_VERSION = 'assessment-calc/1.0.0';

export interface GradeScaleBand {
  min: number; // inclusive, percent or absolute depending on scaleMode
  grade: string;
  points: number;
}

export interface FormulaComponent {
  key: string;
  weight: number; // must sum to 1.0 (ùeps)
}

export interface GradeFormula {
  components: FormulaComponent[];
  scale: GradeScaleBand[];
  passMark: number;
  scaleMode?: 'percent' | 'absolute';
  rounding?: 'half_up_2' | 'floor_2' | 'none';
}

export interface ComponentScore {
  key: string;
  score: number;
  maxMarks: number;
}

export interface CourseCalcInput {
  formula: GradeFormula;
  formulaVersionId: string;
  formulaVersionLabel: string;
  components: ComponentScore[];
  courseCredits: number;
}

export interface CourseCalcResult {
  internalMarks: number | null;
  externalMarks: number | null;
  totalMarks: number;
  percent: number;
  letterGrade: string;
  gradePoints: number;
  creditsEarned: number;
  passed: boolean;
  calculationDetail: Record<string, unknown>;
  formulaVersionId: string;
  formulaVersionLabel: string;
  evaluatorVersion: string;
}

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  path?: string;
}

const EPS = 1e-9;

export function roundHalfUp2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function applyRounding(
  n: number,
  mode: GradeFormula['rounding'] = 'half_up_2',
): number {
  if (mode === 'none') return n;
  if (mode === 'floor_2') return Math.floor(n * 100) / 100;
  return roundHalfUp2(n);
}

export function validateFormula(formula: GradeFormula): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!formula.components?.length) {
    issues.push({
      code: 'FORMULA_EMPTY',
      severity: 'error',
      message: 'Formula must have at least one component',
    });
  }
  const weightSum = (formula.components ?? []).reduce(
    (s, c) => s + c.weight,
    0,
  );
  if (Math.abs(weightSum - 1) > 1e-6) {
    issues.push({
      code: 'WEIGHT_SUM',
      severity: 'error',
      message: `Component weights must sum to 1 (got ${weightSum})`,
      path: 'components',
    });
  }
  for (const c of formula.components ?? []) {
    if (c.weight < 0 || c.weight > 1) {
      issues.push({
        code: 'WEIGHT_RANGE',
        severity: 'error',
        message: `Weight for ${c.key} out of range`,
        path: `components.${c.key}`,
      });
    }
  }
  if (!formula.scale?.length) {
    issues.push({
      code: 'SCALE_EMPTY',
      severity: 'error',
      message: 'Grade scale required',
    });
  }
  const sorted = [...(formula.scale ?? [])].sort((a, b) => b.min - a.min);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]!.min < sorted[i + 1]!.min) {
      issues.push({
        code: 'SCALE_ORDER',
        severity: 'error',
        message: 'Scale bands must be descending by min',
      });
      break;
    }
  }
  if (formula.passMark < 0 || formula.passMark > 100) {
    issues.push({
      code: 'PASS_MARK_RANGE',
      severity: 'error',
      message: 'passMark must be 0ù100',
    });
  }
  return issues;
}

export function validateComponentScores(
  formula: GradeFormula,
  components: ComponentScore[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byKey = new Map(components.map((c) => [c.key, c]));
  for (const fc of formula.components) {
    const score = byKey.get(fc.key);
    if (!score) {
      issues.push({
        code: 'MISSING_COMPONENT',
        severity: 'error',
        message: `Missing score for component ${fc.key}`,
        path: fc.key,
      });
      continue;
    }
    if (score.maxMarks <= 0) {
      issues.push({
        code: 'MAX_MARKS',
        severity: 'error',
        message: `maxMarks must be > 0 for ${fc.key}`,
        path: fc.key,
      });
    }
    if (score.score < 0 || score.score > score.maxMarks + EPS) {
      issues.push({
        code: 'SCORE_RANGE',
        severity: 'error',
        message: `Score ${score.score} outside 0..${score.maxMarks} for ${fc.key}`,
        path: fc.key,
      });
    }
  }
  for (const c of components) {
    if (!formula.components.some((f) => f.key === c.key)) {
      issues.push({
        code: 'UNKNOWN_COMPONENT',
        severity: 'warning',
        message: `Extra component ${c.key} ignored`,
        path: c.key,
      });
    }
  }
  return issues;
}

export function detectAnomalies(
  components: ComponentScore[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const c of components) {
    if (c.score === 0 && c.maxMarks > 0) {
      issues.push({
        code: 'ZERO_SCORE',
        severity: 'warning',
        message: `Zero score for ${c.key}`,
        path: c.key,
      });
    }
    if (c.score === c.maxMarks && c.maxMarks > 0) {
      issues.push({
        code: 'PERFECT_SCORE',
        severity: 'warning',
        message: `Perfect score for ${c.key}`,
        path: c.key,
      });
    }
  }
  return issues;
}

function letterFromScale(
  value: number,
  scale: GradeScaleBand[],
): GradeScaleBand {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  for (const band of sorted) {
    if (value + EPS >= band.min) return band;
  }
  return sorted[sorted.length - 1]!;
}

/**
 * Weighted total: sum(weight_i * (score_i / max_i) * 100) for percent mode,
 * or sum(weight_i * score_i) for absolute mode with shared scale.
 */
export function calculateCourseResult(input: CourseCalcInput): CourseCalcResult {
  const formulaIssues = validateFormula(input.formula);
  const scoreIssues = validateComponentScores(input.formula, input.components);
  const errors = [...formulaIssues, ...scoreIssues].filter(
    (i) => i.severity === 'error',
  );
  if (errors.length) {
    throw new Error(
      `Calculation validation failed: ${errors.map((e) => e.code).join(',')}`,
    );
  }

  const mode = input.formula.scaleMode ?? 'percent';
  const rounding = input.formula.rounding ?? 'half_up_2';
  const byKey = new Map(input.components.map((c) => [c.key, c]));

  let weightedPercent = 0;
  let weightedAbsolute = 0;
  const detailComponents: Record<string, unknown>[] = [];

  for (const fc of input.formula.components) {
    const c = byKey.get(fc.key)!;
    const pct = (c.score / c.maxMarks) * 100;
    weightedPercent += fc.weight * pct;
    weightedAbsolute += fc.weight * c.score;
    detailComponents.push({
      key: fc.key,
      score: c.score,
      maxMarks: c.maxMarks,
      percent: applyRounding(pct, rounding),
      weight: fc.weight,
      contributionPercent: applyRounding(fc.weight * pct, rounding),
    });
  }

  const percent = applyRounding(weightedPercent, rounding);
  const totalMarks = applyRounding(
    mode === 'absolute' ? weightedAbsolute : weightedPercent,
    rounding,
  );
  const scaleValue = mode === 'absolute' ? totalMarks : percent;
  const band = letterFromScale(scaleValue, input.formula.scale);
  // passMark is always interpreted in the same units as scaleValue
  const passed = scaleValue + EPS >= input.formula.passMark;
  const creditsEarned = passed ? input.courseCredits : 0;

  const internal = byKey.get('internal');
  const external = byKey.get('external');

  return {
    internalMarks: internal ? applyRounding(internal.score, rounding) : null,
    externalMarks: external ? applyRounding(external.score, rounding) : null,
    totalMarks,
    percent,
    letterGrade: band.grade,
    gradePoints: band.points,
    creditsEarned,
    passed,
    calculationDetail: {
      mode,
      rounding,
      passMark: input.formula.passMark,
      components: detailComponents,
      scaleBand: band,
      anomalies: detectAnomalies(input.components),
    },
    formulaVersionId: input.formulaVersionId,
    formulaVersionLabel: input.formulaVersionLabel,
    evaluatorVersion: ASSESSMENT_EVALUATOR_VERSION,
  };
}

export interface GpaCourseInput {
  gradePoints: number;
  credits: number;
  include: boolean;
}

export interface GpaResult {
  value: number;
  creditsConsidered: number;
  evaluatorVersion: string;
  detail: Record<string, unknown>;
}

/** SGPA/CGPA: ?(GP ù credits) / ?(credits). Deterministic half-up 3dp. */
export function calculateGpa(courses: GpaCourseInput[]): GpaResult {
  let num = 0;
  let den = 0;
  const included: GpaCourseInput[] = [];
  for (const c of courses) {
    if (!c.include || c.credits <= 0) continue;
    num += c.gradePoints * c.credits;
    den += c.credits;
    included.push(c);
  }
  if (den === 0) {
    return {
      value: 0,
      creditsConsidered: 0,
      evaluatorVersion: ASSESSMENT_EVALUATOR_VERSION,
      detail: { included: [] },
    };
  }
  const raw = num / den;
  const value = Math.round((raw + Number.EPSILON) * 1000) / 1000;
  return {
    value,
    creditsConsidered: applyRounding(den, 'half_up_2'),
    evaluatorVersion: ASSESSMENT_EVALUATOR_VERSION,
    detail: { numerator: num, denominator: den, included },
  };
}

export function contentHashPayload(payload: unknown): Buffer {
  // lazy import avoided ù use crypto via caller; pure stringify helper here
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256')
    .update(stableStringify(payload))
    .digest();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}
