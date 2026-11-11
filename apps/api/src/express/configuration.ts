import { Router, type Router as ExpressRouter } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import {
  AcademicPeriod,
  AuditEvent,
  Campus,
  Course,
  Department,
  Programme,
  SchoolGrade,
  SchoolSection,
  Tenant,
} from './models';
import { ApiRequest, asyncRoute, HttpError } from './http';
import { requirePermissions, requireTenant } from './middleware';

const campusSchema = z.object({
  code: z.string().trim().min(1).max(24),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(500).default(''),
}).strict();

const periodSchema = z.object({
  campusId: z.string().refine(isValidObjectId, 'campusId must be a valid ID.'),
  name: z.string().trim().min(2).max(120),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).strict().superRefine((value, context) => {
  if (value.endDate <= value.startDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'endDate must be after startDate.' });
  }
});

const gradeSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
}).strict();

const sectionSchema = z.object({
  academicPeriodId: z.string().refine(isValidObjectId, 'academicPeriodId must be a valid ID.'),
  gradeId: z.string().refine(isValidObjectId, 'gradeId must be a valid ID.'),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  capacity: z.number().int().min(1).max(1000).nullable().optional(),
}).strict();

const departmentSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
}).strict();

const programmeSchema = z.object({
  departmentId: z.string().refine(isValidObjectId, 'departmentId must be a valid ID.'),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  durationTerms: z.number().int().min(1).max(24).default(8),
}).strict();

const courseSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  credits: z.number().min(0).max(100).default(0),
}).strict();

const institutionUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
}).strict();

const statusSchema = z.object({ status: z.enum(['active', 'inactive']) }).strict();

function rejectBodyTenant(body: unknown): void {
  if (body && typeof body === 'object' && 'tenantId' in body) {
    throw new HttpError(400, 'BODY_TENANT_ID_NOT_ALLOWED', 'Choose the workspace using X-Tenant-Id, not the request body.');
  }
}

async function assertInstitutionType(request: ApiRequest, type: 'school' | 'higher_ed'): Promise<void> {
  const tenant = await Tenant.findOne({ _id: request.tenant!.tenantId, institutionType: type }).select('_id');
  if (!tenant) throw new HttpError(409, 'INSTITUTION_TYPE_MISMATCH', `This endpoint is available to ${type} institutions only.`);
}

async function audit(request: ApiRequest, action: string, resourceType: string, resourceId: string): Promise<void> {
  await AuditEvent.create({
    tenantId: request.tenant!.tenantId,
    actorUserId: request.auth!.userId,
    action,
    resourceType,
    resourceId,
    correlationId: request.correlationId,
  });
}

function serialize(document: { _id: { toString(): string }; toObject(): Record<string, unknown> }) {
  const { _id: _storedId, __v: _version, ...data } = document.toObject();
  return { id: document._id.toString(), ...data };
}

export const configurationRouter: ExpressRouter = Router();
configurationRouter.use(requireTenant);

configurationRouter.get('/institution', asyncRoute(async (request, response) => {
  const tenant = await Tenant.findById((request as ApiRequest).tenant!.tenantId).select('name slug institutionType timezone status');
  if (!tenant) throw new HttpError(404, 'TENANT_NOT_FOUND', 'Workspace not found.');
  response.json({ id: tenant._id.toString(), name: tenant.name, slug: tenant.slug, institutionType: tenant.institutionType, timezone: tenant.timezone, status: tenant.status });
}));

configurationRouter.patch('/institution', requirePermissions('institution.manage'), asyncRoute(async (request, response) => {
  rejectBodyTenant(request.body);
  const input = institutionUpdateSchema.parse(request.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'NO_CHANGES', 'Provide at least one setting to update.');
  const apiRequest = request as ApiRequest;
  const tenant = await Tenant.findByIdAndUpdate(apiRequest.tenant!.tenantId, { $set: input }, { new: true, runValidators: true })
    .select('name slug institutionType timezone status');
  if (!tenant) throw new HttpError(404, 'TENANT_NOT_FOUND', 'Workspace not found.');
  await audit(apiRequest, 'institution.updated', 'tenant', tenant._id.toString());
  response.json({ id: tenant._id.toString(), name: tenant.name, slug: tenant.slug, institutionType: tenant.institutionType, timezone: tenant.timezone, status: tenant.status });
}));

configurationRouter.get('/campuses', asyncRoute(async (request, response) => {
  const rows = await Campus.find({ tenantId: (request as ApiRequest).tenant!.tenantId }).sort({ name: 1 });
  response.json({ items: rows.map(serialize) });
}));

configurationRouter.post('/campuses', requirePermissions('institution.manage'), asyncRoute(async (request, response) => {
  rejectBodyTenant(request.body);
  const input = campusSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  const campus = await Campus.create({ ...input, tenantId: apiRequest.tenant!.tenantId });
  await audit(apiRequest, 'campus.created', 'campus', campus._id.toString());
  response.status(201).json(serialize(campus));
}));

configurationRouter.patch('/campuses/:id/status', requirePermissions('institution.manage'), asyncRoute(async (request, response) => {
  if (!isValidObjectId(request.params.id)) throw new HttpError(400, 'INVALID_ID', 'The campus ID is invalid.');
  rejectBodyTenant(request.body);
  const input = statusSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  const campus = await Campus.findOneAndUpdate({ _id: request.params.id, tenantId: apiRequest.tenant!.tenantId }, { $set: input }, { new: true, runValidators: true });
  if (!campus) throw new HttpError(404, 'CAMPUS_NOT_FOUND', 'Campus not found.');
  await audit(apiRequest, 'campus.status_changed', 'campus', campus._id.toString());
  response.json(serialize(campus));
}));

configurationRouter.get('/academic-periods', asyncRoute(async (request, response) => {
  const rows = await AcademicPeriod.find({ tenantId: (request as ApiRequest).tenant!.tenantId }).sort({ startDate: -1 });
  response.json({ items: rows.map(serialize) });
}));

configurationRouter.post('/academic-periods', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectBodyTenant(request.body);
  const input = periodSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  const campus = await Campus.exists({ _id: input.campusId, tenantId: apiRequest.tenant!.tenantId, status: 'active' });
  if (!campus) throw new HttpError(404, 'CAMPUS_NOT_FOUND', 'An active campus in this workspace is required.');
  const period = await AcademicPeriod.create({ ...input, tenantId: apiRequest.tenant!.tenantId });
  await audit(apiRequest, 'academic_period.created', 'academic_period', period._id.toString());
  response.status(201).json(serialize(period));
}));

configurationRouter.get('/school/grades', asyncRoute(async (request, response) => {
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'school');
  const rows = await SchoolGrade.find({ tenantId: apiRequest.tenant!.tenantId }).sort({ code: 1 });
  response.json({ items: rows.map(serialize) });
}));

configurationRouter.post('/school/grades', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectBodyTenant(request.body);
  const input = gradeSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'school');
  const grade = await SchoolGrade.create({ ...input, tenantId: apiRequest.tenant!.tenantId });
  await audit(apiRequest, 'school_grade.created', 'school_grade', grade._id.toString());
  response.status(201).json(serialize(grade));
}));

configurationRouter.get('/school/sections', asyncRoute(async (request, response) => {
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'school');
  const rows = await SchoolSection.find({ tenantId: apiRequest.tenant!.tenantId }).sort({ name: 1 });
  response.json({ items: rows.map(serialize) });
}));

configurationRouter.post('/school/sections', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectBodyTenant(request.body);
  const input = sectionSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'school');
  const [period, grade] = await Promise.all([
    AcademicPeriod.exists({ _id: input.academicPeriodId, tenantId: apiRequest.tenant!.tenantId }),
    SchoolGrade.exists({ _id: input.gradeId, tenantId: apiRequest.tenant!.tenantId, status: 'active' }),
  ]);
  if (!period || !grade) throw new HttpError(404, 'ACADEMIC_CONFIGURATION_NOT_FOUND', 'The period and active grade must belong to this workspace.');
  const section = await SchoolSection.create({ ...input, tenantId: apiRequest.tenant!.tenantId });
  await audit(apiRequest, 'school_section.created', 'school_section', section._id.toString());
  response.status(201).json(serialize(section));
}));

configurationRouter.get('/higher-ed/departments', asyncRoute(async (request, response) => {
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'higher_ed');
  const rows = await Department.find({ tenantId: apiRequest.tenant!.tenantId }).sort({ code: 1 });
  response.json({ items: rows.map(serialize) });
}));

configurationRouter.post('/higher-ed/departments', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectBodyTenant(request.body);
  const input = departmentSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'higher_ed');
  const department = await Department.create({ ...input, tenantId: apiRequest.tenant!.tenantId });
  await audit(apiRequest, 'department.created', 'department', department._id.toString());
  response.status(201).json(serialize(department));
}));

configurationRouter.get('/higher-ed/programmes', asyncRoute(async (request, response) => {
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'higher_ed');
  const rows = await Programme.find({ tenantId: apiRequest.tenant!.tenantId }).sort({ code: 1 });
  response.json({ items: rows.map(serialize) });
}));

configurationRouter.post('/higher-ed/programmes', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectBodyTenant(request.body);
  const input = programmeSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'higher_ed');
  const department = await Department.exists({ _id: input.departmentId, tenantId: apiRequest.tenant!.tenantId, status: 'active' });
  if (!department) throw new HttpError(404, 'DEPARTMENT_NOT_FOUND', 'An active department in this workspace is required.');
  const programme = await Programme.create({ ...input, tenantId: apiRequest.tenant!.tenantId });
  await audit(apiRequest, 'programme.created', 'programme', programme._id.toString());
  response.status(201).json(serialize(programme));
}));

configurationRouter.get('/higher-ed/courses', asyncRoute(async (request, response) => {
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'higher_ed');
  const rows = await Course.find({ tenantId: apiRequest.tenant!.tenantId }).sort({ code: 1 });
  response.json({ items: rows.map(serialize) });
}));

configurationRouter.post('/higher-ed/courses', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectBodyTenant(request.body);
  const input = courseSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  await assertInstitutionType(apiRequest, 'higher_ed');
  const course = await Course.create({ ...input, tenantId: apiRequest.tenant!.tenantId });
  await audit(apiRequest, 'course.created', 'course', course._id.toString());
  response.status(201).json(serialize(course));
}));
