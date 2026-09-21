import { z } from 'zod';

/** Declarative academic rule document (v1). */
export const RuleNodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('credit_total'),
      min: z.number().nonnegative(),
      categories: z.array(z.string()).optional(),
    }),
    z.object({
      type: z.literal('course_completed'),
      courseVersionId: z.string().uuid().optional(),
      courseId: z.string().uuid().optional(),
      minGrade: z.string().optional(),
    }),
    z.object({
      type: z.literal('group_credits'),
      courseGroupId: z.string().uuid(),
      minCredits: z.number().nonnegative(),
    }),
    z.object({
      type: z.literal('prerequisite_satisfied'),
      courseVersionId: z.string().uuid(),
    }),
    z.object({
      type: z.literal('term_standing'),
      minCgpa: z.number().optional(),
      maxFailCount: z.number().int().optional(),
    }),
    z.object({
      type: z.literal('exit_eligible'),
      exitAwardCode: z.string().min(1),
    }),
    z.object({
      type: z.literal('all'),
      nodes: z.array(RuleNodeSchema),
    }),
    z.object({
      type: z.literal('any'),
      nodes: z.array(RuleNodeSchema),
    }),
    z.object({
      type: z.literal('not'),
      node: RuleNodeSchema,
    }),
  ]),
);

export type RuleNode =
  | { type: 'credit_total'; min: number; categories?: string[] }
  | {
      type: 'course_completed';
      courseVersionId?: string;
      courseId?: string;
      minGrade?: string;
    }
  | { type: 'group_credits'; courseGroupId: string; minCredits: number }
  | { type: 'prerequisite_satisfied'; courseVersionId: string }
  | { type: 'term_standing'; minCgpa?: number; maxFailCount?: number }
  | { type: 'exit_eligible'; exitAwardCode: string }
  | { type: 'all'; nodes: RuleNode[] }
  | { type: 'any'; nodes: RuleNode[] }
  | { type: 'not'; node: RuleNode };

export const RuleDocumentSchema = z.object({
  version: z.literal('1'),
  all: z.array(RuleNodeSchema).optional(),
  any: z.array(RuleNodeSchema).optional(),
  not: RuleNodeSchema.optional(),
});

export type RuleDocument = z.infer<typeof RuleDocumentSchema>;

export const COURSE_CATEGORIES = [
  'core',
  'elective',
  'major',
  'minor',
  'multidisciplinary',
  'ability_enhancement',
  'skill_enhancement',
  'value_added',
  'internship',
  'community_engagement',
  'project',
  'research',
  'other',
] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];
