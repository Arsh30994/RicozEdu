import { z } from 'zod';

export const ErrorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  correlationId: z.string().uuid(),
  details: z.unknown().optional(),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const CreateTenantSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(200),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(12),
  adminGivenName: z.string().min(1).max(100),
  adminFamilyName: z.string().min(1).max(100),
});

export const CreateInstitutionSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
});

export const CreateCampusSchema = z.object({
  institutionId: z.string().uuid(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
});

export const CreatePersonSchema = z.object({
  givenName: z.string().min(1).max(100),
  familyName: z.string().min(1).max(100),
  primaryEmail: z.string().email().optional(),
  dateOfBirth: z.string().date().optional(),
});

export const CreateStudentSchema = z.object({
  institutionId: z.string().uuid(),
  campusId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
  person: CreatePersonSchema.optional(),
  studentNumber: z.string().min(1).max(64),
  status: z
    .enum(['prospective', 'active', 'inactive', 'graduated', 'withdrawn', 'suspended'])
    .optional(),
  effectiveFrom: z.string().date().optional(),
  version: z.number().int().positive().optional(),
}).refine((v) => Boolean(v.personId || v.person), {
  message: 'personId or person is required',
});

export const PatchStudentStatusSchema = z.object({
  toStatus: z.enum(['prospective', 'active', 'inactive', 'graduated', 'withdrawn', 'suspended']),
  reason: z.string().min(1).max(500),
  version: z.number().int().positive(),
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  givenName: z.string().min(1).max(100),
  familyName: z.string().min(1).max(100),
  institutionId: z.string().uuid().optional(),
});

export const CreateMembershipSchema = z.object({
  userId: z.string().uuid(),
  institutionId: z.string().uuid().optional(),
});

export const CreateRoleBindingSchema = z.object({
  userMembershipId: z.string().uuid(),
  institutionId: z.string().uuid().optional(),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type CreateTenant = z.infer<typeof CreateTenantSchema>;
export type CreateStudent = z.infer<typeof CreateStudentSchema>;

/** Course category enum aligned with curriculum_course_requirements.category */
export const CourseCategorySchema = z.enum([
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
]);
export type CourseCategory = z.infer<typeof CourseCategorySchema>;

/** Declarative academic rule node (v1) */
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
  | { type: 'exit_eligible'; exitAwardCode: string };

export const RuleNodeSchema: z.ZodType<RuleNode> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('credit_total'),
    min: z.number(),
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
    minCredits: z.number(),
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
]);

export const RuleDocumentSchema = z.object({
  version: z.literal('1'),
  all: z.array(RuleNodeSchema).optional(),
  any: z.array(RuleNodeSchema).optional(),
  not: RuleNodeSchema.optional(),
});

export type RuleDocument = z.infer<typeof RuleDocumentSchema>;

export const RuleVersionRefsSchema = z.object({
  programmeVersionId: z.string().uuid().optional(),
  curriculumVersionId: z.string().uuid().optional(),
  progressionRuleIds: z.array(z.string().uuid()).optional(),
  evaluatorVersion: z.string().min(1),
});
export type RuleVersionRefs = z.infer<typeof RuleVersionRefsSchema>;
