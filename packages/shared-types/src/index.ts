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
