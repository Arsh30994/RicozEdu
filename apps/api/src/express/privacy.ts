import { Router, type Router as ExpressRouter } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { AuditEvent, ConsentRecord, Membership, PrivacyRequest, Student } from './models';
import { ApiRequest, asyncRoute, HttpError } from './http';
import { hasPermission, requirePermissions, requireTenant } from './middleware';

const subjectSchema = z.object({
  subjectType: z.enum(['student', 'user']),
  subjectId: z.string().refine(isValidObjectId, 'subjectId must be a valid ID.'),
});

const consentSchema = subjectSchema.extend({
  purpose: z.string().trim().min(2).max(160),
  noticeVersion: z.string().trim().min(1).max(80),
  state: z.enum(['granted', 'withdrawn']),
  evidence: z.string().trim().max(500).default(''),
}).strict();

const privacyRequestSchema = subjectSchema.extend({
  requestType: z.enum(['access', 'correction', 'erasure']),
  details: z.string().trim().max(2000).default(''),
}).strict();

const resolveSchema = z.object({
  status: z.enum(['in_review', 'fulfilled', 'rejected']),
  resolution: z.string().trim().min(2).max(2000),
}).strict();

async function assertSubjectInTenant(request: ApiRequest, subjectType: 'student' | 'user', subjectId: string): Promise<void> {
  const exists = subjectType === 'student'
    ? await Student.exists({ _id: subjectId, tenantId: request.tenant!.tenantId })
    : await Membership.exists({ userId: subjectId, tenantId: request.tenant!.tenantId, status: 'active' });
  if (!exists) throw new HttpError(404, 'PRIVACY_SUBJECT_NOT_FOUND', 'The privacy subject does not belong to this workspace.');
}

function serialize(document: { _id: { toString(): string }; toObject(): Record<string, unknown> }) {
  const { _id: _storedId, __v: _version, ...data } = document.toObject();
  return { id: document._id.toString(), ...data };
}

export const privacyRouter: ExpressRouter = Router();
privacyRouter.use(requireTenant);

privacyRouter.get('/privacy/consents', requirePermissions('privacy.manage'), asyncRoute(async (request, response) => {
  const rows = await ConsentRecord.find({ tenantId: (request as ApiRequest).tenant!.tenantId }).sort({ createdAt: -1 }).limit(200);
  response.json({ items: rows.map(serialize) });
}));

privacyRouter.post('/privacy/consents', requirePermissions('privacy.manage'), asyncRoute(async (request, response) => {
  if (request.body && typeof request.body === 'object' && 'tenantId' in request.body) {
    throw new HttpError(400, 'BODY_TENANT_ID_NOT_ALLOWED', 'Choose the workspace using X-Tenant-Id, not the request body.');
  }
  const input = consentSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  await assertSubjectInTenant(apiRequest, input.subjectType, input.subjectId);
  const record = await ConsentRecord.create({
    ...input,
    tenantId: apiRequest.tenant!.tenantId,
    capturedBy: apiRequest.auth!.userId,
    withdrawnAt: input.state === 'withdrawn' ? new Date() : null,
  });
  await AuditEvent.create({
    tenantId: apiRequest.tenant!.tenantId,
    actorUserId: apiRequest.auth!.userId,
    action: `privacy.consent_${input.state}`,
    resourceType: 'consent',
    resourceId: record._id.toString(),
    correlationId: apiRequest.correlationId,
  });
  response.status(201).json(serialize(record));
}));

privacyRouter.get('/privacy/requests', requirePermissions('privacy.manage'), asyncRoute(async (request, response) => {
  const rows = await PrivacyRequest.find({ tenantId: (request as ApiRequest).tenant!.tenantId }).sort({ createdAt: -1 }).limit(200);
  response.json({ items: rows.map(serialize) });
}));

privacyRouter.post('/privacy/requests', asyncRoute(async (request, response) => {
  if (request.body && typeof request.body === 'object' && 'tenantId' in request.body) {
    throw new HttpError(400, 'BODY_TENANT_ID_NOT_ALLOWED', 'Choose the workspace using X-Tenant-Id, not the request body.');
  }
  const input = privacyRequestSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  const selfService = input.subjectType === 'user' && input.subjectId === apiRequest.auth!.userId.toString();
  if (!selfService && !hasPermission(apiRequest.tenant!.role, apiRequest.tenant!.permissions, 'privacy.manage')) {
    throw new HttpError(403, 'FORBIDDEN', 'You may only submit a privacy request for yourself.');
  }
  await assertSubjectInTenant(apiRequest, input.subjectType, input.subjectId);
  const record = await PrivacyRequest.create({ ...input, tenantId: apiRequest.tenant!.tenantId, createdBy: apiRequest.auth!.userId });
  await AuditEvent.create({
    tenantId: apiRequest.tenant!.tenantId,
    actorUserId: apiRequest.auth!.userId,
    action: 'privacy.request_submitted',
    resourceType: 'privacy_request',
    resourceId: record._id.toString(),
    correlationId: apiRequest.correlationId,
  });
  response.status(201).json(serialize(record));
}));

privacyRouter.patch('/privacy/requests/:id', requirePermissions('privacy.manage'), asyncRoute(async (request, response) => {
  if (!isValidObjectId(request.params.id)) throw new HttpError(400, 'INVALID_ID', 'The privacy request ID is invalid.');
  const input = resolveSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  const record = await PrivacyRequest.findOneAndUpdate(
    { _id: request.params.id, tenantId: apiRequest.tenant!.tenantId },
    { $set: { ...input, resolvedBy: apiRequest.auth!.userId } },
    { new: true, runValidators: true },
  );
  if (!record) throw new HttpError(404, 'PRIVACY_REQUEST_NOT_FOUND', 'Privacy request not found.');
  await AuditEvent.create({
    tenantId: apiRequest.tenant!.tenantId,
    actorUserId: apiRequest.auth!.userId,
    action: 'privacy.request_resolved',
    resourceType: 'privacy_request',
    resourceId: record._id.toString(),
    correlationId: apiRequest.correlationId,
    metadata: { status: input.status },
  });
  response.json(serialize(record));
}));
