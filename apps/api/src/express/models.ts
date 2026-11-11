import { model, models, Schema, Types } from 'mongoose';

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 63 },
    institutionType: { type: String, enum: ['school', 'higher_ed'], default: 'higher_ed', required: true },
    timezone: { type: String, default: 'Asia/Kolkata', required: true, maxlength: 100 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  },
  { timestamps: true },
);
tenantSchema.index({ slug: 1 }, { unique: true });

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: false, select: false },
    googleSub: { type: String, required: false, select: false },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', required: true },
    authorizationVersion: { type: Number, default: 0, required: true },
  },
  { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleSub: 1 }, { unique: true, sparse: true });

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'RicozUser', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    role: { type: String, enum: ['owner', 'admin', 'faculty', 'finance', 'guardian', 'student'], required: true },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  },
  { timestamps: true },
);
membershipSchema.index({ userId: 1, tenantId: 1 }, { unique: true });
membershipSchema.index({ tenantId: 1, status: 1, role: 1 });

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'RicozUser', required: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const statusHistorySchema = new Schema(
  {
    status: { type: String, enum: ['prospective', 'active', 'inactive', 'graduated', 'withdrawn', 'suspended'], required: true },
    reason: { type: String, trim: true, maxlength: 500 },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'RicozUser', required: true },
    changedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const studentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'RicozUser', default: null },
    studentNo: { type: String, required: true, trim: true, maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    department: { type: String, trim: true, maxlength: 120, default: '' },
    campus: { type: String, trim: true, maxlength: 120, default: '' },
    status: { type: String, enum: ['prospective', 'active', 'inactive', 'graduated', 'withdrawn', 'suspended'], default: 'prospective', required: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'RicozUser', required: true },
  },
  { timestamps: true },
);
studentSchema.index({ tenantId: 1, studentNo: 1 }, { unique: true });
studentSchema.index({ tenantId: 1, status: 1, fullName: 1 });
studentSchema.index({ tenantId: 1, email: 1 });

const campusSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 500, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true },
);
campusSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const academicPeriodSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    campusId: { type: Schema.Types.ObjectId, ref: 'RicozCampus', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['planned', 'active', 'closed'], default: 'planned', required: true },
  },
  { timestamps: true },
);
academicPeriodSchema.index({ tenantId: 1, campusId: 1, name: 1 }, { unique: true });

const schoolGradeSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true },
);
schoolGradeSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const schoolSectionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    academicPeriodId: { type: Schema.Types.ObjectId, ref: 'RicozAcademicPeriod', required: true },
    gradeId: { type: Schema.Types.ObjectId, ref: 'RicozSchoolGrade', required: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    capacity: { type: Number, min: 1, max: 1000, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true },
);
schoolSectionSchema.index({ tenantId: 1, academicPeriodId: 1, gradeId: 1, code: 1 }, { unique: true });

const departmentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true },
);
departmentSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const programmeSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'RicozDepartment', required: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    durationTerms: { type: Number, min: 1, max: 24, default: 8 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true },
);
programmeSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const courseSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    credits: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true },
);
courseSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const importJobSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'RicozUser', required: true },
    kind: { type: String, enum: ['students'], required: true },
    status: { type: String, enum: ['previewed', 'completed', 'failed'], default: 'previewed', required: true },
    validRows: { type: [Schema.Types.Mixed], default: [] },
    issues: { type: [Schema.Types.Mixed], default: [] },
    summary: { type: Schema.Types.Mixed, default: {} },
    idempotencyKey: { type: String, default: null, maxlength: 120 },
  },
  { timestamps: true },
);
importJobSchema.index({ tenantId: 1, createdAt: -1 });
importJobSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

const consentRecordSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    subjectType: { type: String, enum: ['student', 'guardian', 'user'], required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    purpose: { type: String, required: true, trim: true, maxlength: 160 },
    noticeVersion: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, enum: ['granted', 'withdrawn'], required: true },
    capturedBy: { type: Schema.Types.ObjectId, ref: 'RicozUser', required: true },
    evidence: { type: String, trim: true, maxlength: 500, default: '' },
    withdrawnAt: { type: Date, default: null },
  },
  { timestamps: true },
);
consentRecordSchema.index({ tenantId: 1, subjectType: 1, subjectId: 1, purpose: 1, createdAt: -1 });

const privacyRequestSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    subjectType: { type: String, enum: ['student', 'guardian', 'user'], required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    requestType: { type: String, enum: ['access', 'correction', 'erasure'], required: true },
    details: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: ['submitted', 'in_review', 'fulfilled', 'rejected'], default: 'submitted', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'RicozUser', required: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'RicozUser', default: null },
    resolution: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { timestamps: true },
);
privacyRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const auditEventSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', default: null },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'RicozUser', default: null },
    action: { type: String, required: true, maxlength: 100 },
    resourceType: { type: String, required: true, maxlength: 100 },
    resourceId: { type: String, default: null, maxlength: 100 },
    correlationId: { type: String, required: true, maxlength: 100 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditEventSchema.index({ tenantId: 1, createdAt: -1 });

export const Tenant = models.RicozTenant ?? model('RicozTenant', tenantSchema);
export const User = models.RicozUser ?? model('RicozUser', userSchema);
export const Membership = models.RicozMembership ?? model('RicozMembership', membershipSchema);
export const RefreshToken = models.RicozRefreshToken ?? model('RicozRefreshToken', refreshTokenSchema);
export const Student = models.RicozStudent ?? model('RicozStudent', studentSchema);
export const AuditEvent = models.RicozAuditEvent ?? model('RicozAuditEvent', auditEventSchema);
export const Campus = models.RicozCampus ?? model('RicozCampus', campusSchema);
export const AcademicPeriod = models.RicozAcademicPeriod ?? model('RicozAcademicPeriod', academicPeriodSchema);
export const SchoolGrade = models.RicozSchoolGrade ?? model('RicozSchoolGrade', schoolGradeSchema);
export const SchoolSection = models.RicozSchoolSection ?? model('RicozSchoolSection', schoolSectionSchema);
export const Department = models.RicozDepartment ?? model('RicozDepartment', departmentSchema);
export const Programme = models.RicozProgramme ?? model('RicozProgramme', programmeSchema);
export const Course = models.RicozCourse ?? model('RicozCourse', courseSchema);
export const ImportJob = models.RicozImportJob ?? model('RicozImportJob', importJobSchema);
export const ConsentRecord = models.RicozConsentRecord ?? model('RicozConsentRecord', consentRecordSchema);
export const PrivacyRequest = models.RicozPrivacyRequest ?? model('RicozPrivacyRequest', privacyRequestSchema);

export type ApiRole = 'owner' | 'admin' | 'faculty' | 'finance' | 'guardian' | 'student';
export type StudentStatus =
  | 'prospective'
  | 'active'
  | 'inactive'
  | 'graduated'
  | 'withdrawn'
  | 'suspended';

export interface AuthContext {
  userId: Types.ObjectId;
  email: string;
  authorizationVersion: number;
  sessionId: string;
}

export interface TenantContext {
  tenantId: Types.ObjectId;
  membershipId: Types.ObjectId;
  role: ApiRole;
  permissions: string[];
}
