import { model, models, Schema, Types } from 'mongoose';

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 63 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  },
  { timestamps: true },
);
tenantSchema.index({ slug: 1 }, { unique: true });

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', required: true },
    authorizationVersion: { type: Number, default: 0, required: true },
  },
  { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true });

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'RicozUser', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'RicozTenant', required: true },
    role: { type: String, enum: ['owner', 'admin', 'faculty', 'student'], required: true },
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

export type ApiRole = 'owner' | 'admin' | 'faculty' | 'student';
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
}
