export const PERMISSIONS = {
  TENANT_READ: 'tenant.read',
  TENANT_MANAGE: 'tenant.manage',
  ORG_READ: 'org.read',
  ORG_MANAGE: 'org.manage',
  INSTITUTION_READ: 'institution.read',
  INSTITUTION_MANAGE: 'institution.manage',
  FACULTY_READ: 'faculty.read',
  FACULTY_MANAGE: 'faculty.manage',
  DEPARTMENT_READ: 'department.read',
  DEPARTMENT_MANAGE: 'department.manage',
  MEMBERSHIP_READ: 'membership.read',
  MEMBERSHIP_MANAGE: 'membership.manage',
  ROLE_READ: 'role.read',
  ROLE_MANAGE: 'role.manage',
  PERSON_READ: 'person.read',
  PERSON_MANAGE: 'person.manage',
  STUDENT_READ: 'student.read',
  STUDENT_MANAGE: 'student.manage',
  ACADEMIC_READ: 'academic.read',
  ACADEMIC_MANAGE: 'academic.manage',
  SECTION_READ: 'section.read',
  SECTION_MANAGE: 'section.manage',
  GRADE_MANAGE: 'grade.manage',
  RESULT_PUBLISH: 'result.publish',
  RESULT_CORRECT: 'result.correct',
  CREDENTIAL_MANAGE: 'credential.manage',
  DELEGATION_MANAGE: 'delegation.manage',
  DELEGATION_ACCEPT: 'delegation.accept',
  SESSION_MANAGE: 'session.manage',
  MFA_MANAGE: 'mfa.manage',
  AUDIT_READ: 'audit.read',
  PLATFORM_BOOTSTRAP: 'platform.bootstrap',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const SYSTEM_ROLES = {
  TENANT_ADMIN: 'TenantAdmin',
  REGISTRAR: 'Registrar',
  INSTRUCTOR: 'Instructor',
  STUDENT: 'Student',
  AUDITOR: 'Auditor',
} as const;

export interface AccessTokenClaims {
  sub: string;
  av: number;
  sid: string;
}
