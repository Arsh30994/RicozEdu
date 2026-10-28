import { Router, type Router as ExpressRouter } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { assertTransition } from '../students/status-transitions';
import { AuditEvent, Student, StudentStatus } from './models';
import { ApiRequest, asyncRoute, HttpError } from './http';
import { requireRoles, requireTenant } from './middleware';

const createStudentSchema = z.object({
  studentNo: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email().max(254).optional(),
  department: z.string().trim().max(120).optional(),
  campus: z.string().trim().max(120).optional(),
  status: z.enum(['prospective', 'active', 'inactive', 'graduated', 'withdrawn', 'suspended']).default('prospective'),
}).strict();

const statusSchema = z.object({
  status: z.enum(['prospective', 'active', 'inactive', 'graduated', 'withdrawn', 'suspended']),
  reason: z.string().trim().max(500).optional(),
}).strict();

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['prospective', 'active', 'inactive', 'graduated', 'withdrawn', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

function serializeStudent(student: {
  _id: Types.ObjectId;
  studentNo: string;
  fullName: string;
  email?: string;
  department?: string;
  campus?: string;
  status: StudentStatus;
  statusHistory: Array<{ status: StudentStatus; reason?: string; actorUserId: Types.ObjectId; changedAt: Date }>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: student._id.toString(),
    studentNo: student.studentNo,
    name: student.fullName,
    email: student.email ?? '',
    department: student.department ?? '',
    campus: student.campus ?? '',
    status: student.status,
    history: student.statusHistory.map((entry) => ({
      status: entry.status,
      reason: entry.reason ?? '',
      actorUserId: entry.actorUserId.toString(),
      changedAt: entry.changedAt,
    })),
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

export const studentsRouter: ExpressRouter = Router();
studentsRouter.use(requireTenant);

studentsRouter.get('/dashboard/summary', requireRoles('owner', 'admin', 'faculty'), asyncRoute(async (request, response) => {
  const tenantId = (request as ApiRequest).tenant!.tenantId;
  const [total, active, prospective, suspended, recentAudit] = await Promise.all([
    Student.countDocuments({ tenantId }),
    Student.countDocuments({ tenantId, status: 'active' }),
    Student.countDocuments({ tenantId, status: 'prospective' }),
    Student.countDocuments({ tenantId, status: 'suspended' }),
    AuditEvent.find({ tenantId }).sort({ createdAt: -1 }).limit(5).select('action resourceType resourceId createdAt'),
  ]);
  response.json({ students: { total, active, prospective, suspended }, recentActivity: recentAudit });
}));

studentsRouter.get('/students', asyncRoute(async (request, response) => {
  const input = listQuerySchema.parse(request.query);
  const apiRequest = request as ApiRequest;
  const filter: Record<string, unknown> = { tenantId: apiRequest.tenant!.tenantId };
  if (apiRequest.tenant!.role === 'student') filter.userId = apiRequest.auth!.userId;
  if (input.status) filter.status = input.status;
  if (input.q) {
    const escaped = input.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ studentNo: expression }, { fullName: expression }, { email: expression }];
  }
  const [rows, total] = await Promise.all([
    Student.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit),
    Student.countDocuments(filter),
  ]);
  response.json({
    items: rows.map(serializeStudent),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  });
}));

studentsRouter.post('/students', requireRoles('owner', 'admin', 'faculty'), asyncRoute(async (request, response) => {
  if ('tenantId' in (request.body ?? {})) {
    throw new HttpError(400, 'BODY_TENANT_ID_NOT_ALLOWED', 'Choose the workspace using X-Tenant-Id, not the request body.');
  }
  const input = createStudentSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  const student = await Student.create({
    ...input,
    tenantId: apiRequest.tenant!.tenantId,
    createdBy: apiRequest.auth!.userId,
    statusHistory: [{
      status: input.status,
      actorUserId: apiRequest.auth!.userId,
      changedAt: new Date(),
    }],
  });
  await AuditEvent.create({
    tenantId: apiRequest.tenant!.tenantId,
    actorUserId: apiRequest.auth!.userId,
    action: 'student.created',
    resourceType: 'student',
    resourceId: student._id.toString(),
    correlationId: apiRequest.correlationId,
  });
  response.status(201).json(serializeStudent(student));
}));

studentsRouter.get('/students/:id', asyncRoute(async (request, response) => {
  if (!isValidObjectId(request.params.id)) throw new HttpError(400, 'INVALID_ID', 'The student ID is invalid.');
  const apiRequest = request as ApiRequest;
  const filter: Record<string, unknown> = {
    _id: request.params.id,
    tenantId: apiRequest.tenant!.tenantId,
  };
  if (apiRequest.tenant!.role === 'student') filter.userId = apiRequest.auth!.userId;
  const student = await Student.findOne(filter);
  if (!student) throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
  response.json(serializeStudent(student));
}));

studentsRouter.patch('/students/:id/status', requireRoles('owner', 'admin', 'faculty'), asyncRoute(async (request, response) => {
  if (!isValidObjectId(request.params.id)) throw new HttpError(400, 'INVALID_ID', 'The student ID is invalid.');
  if ('tenantId' in (request.body ?? {})) {
    throw new HttpError(400, 'BODY_TENANT_ID_NOT_ALLOWED', 'Choose the workspace using X-Tenant-Id, not the request body.');
  }
  const input = statusSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  const student = await Student.findOne({
    _id: request.params.id,
    tenantId: apiRequest.tenant!.tenantId,
  });
  if (!student) throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
  try {
    assertTransition(student.status, input.status);
  } catch {
    throw new HttpError(409, 'INVALID_STATUS_TRANSITION', `Cannot transition student from ${student.status} to ${input.status}.`);
  }

  const updated = await Student.findOneAndUpdate(
    { _id: student._id, tenantId: apiRequest.tenant!.tenantId, status: student.status },
    {
      $set: { status: input.status },
      $push: {
        statusHistory: {
          status: input.status,
          reason: input.reason,
          actorUserId: apiRequest.auth!.userId,
          changedAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true },
  );
  if (!updated) throw new HttpError(409, 'STATUS_CHANGED', 'The student status changed concurrently; reload and try again.');
  await AuditEvent.create({
    tenantId: apiRequest.tenant!.tenantId,
    actorUserId: apiRequest.auth!.userId,
    action: 'student.status_changed',
    resourceType: 'student',
    resourceId: updated._id.toString(),
    correlationId: apiRequest.correlationId,
    metadata: { from: student.status, to: input.status },
  });
  response.json(serializeStudent(updated));
}));
