import { Router, type Router as ExpressRouter } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { AuditEvent, ImportJob, Student } from './models';
import { ApiRequest, asyncRoute, HttpError } from './http';
import { parseCsv, toCsv } from './csv';
import { requirePermissions, requireTenant } from './middleware';

const statusValues = ['prospective', 'active', 'inactive', 'graduated', 'withdrawn', 'suspended'] as const;
const importStudentSchema = z.object({
  studentNo: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(2).max(120),
  email: z.union([z.string().email().max(254), z.literal('')]).optional().transform((value) => value || undefined),
  department: z.string().trim().max(120).optional(),
  campus: z.string().trim().max(120).optional(),
  status: z.enum(statusValues).default('prospective'),
});

const previewSchema = z.object({
  csv: z.string().min(1).max(750_000),
  mapping: z.object({
    studentNo: z.string().trim().min(1).max(120).optional(),
    fullName: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().min(1).max(120).optional(),
    department: z.string().trim().min(1).max(120).optional(),
    campus: z.string().trim().min(1).max(120).optional(),
    status: z.string().trim().min(1).max(120).optional(),
  }).strict().optional(),
}).strict();

const listQuerySchema = z.object({
  status: z.enum(statusValues).optional(),
  q: z.string().trim().max(120).optional(),
}).strict();

type ImportStudent = z.output<typeof importStudentSchema>;
type PreviewError = { row: number; field?: string; message: string };

function serializeJob(job: { _id: { toString(): string }; kind: string; status: string; summary: unknown; issues: unknown[]; createdAt: Date; updatedAt: Date }) {
  return {
    id: job._id.toString(), kind: job.kind, status: job.status, summary: job.summary,
    errors: job.issues, createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}

function idempotencyKey(request: ApiRequest): string | undefined {
  const key = request.header('idempotency-key')?.trim();
  if (!key) return undefined;
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(key)) {
    throw new HttpError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must use 8-120 letters, numbers, underscores, or hyphens.');
  }
  return key;
}

function getCell(row: Record<string, string>, mapping: z.output<typeof previewSchema>['mapping'], field: keyof ImportStudent): string | undefined {
  const header = mapping?.[field] ?? field;
  return row[header];
}

export const importsRouter: ExpressRouter = Router();
importsRouter.use(requireTenant);

importsRouter.post('/imports/students/preview', requirePermissions('imports.manage'), asyncRoute(async (request, response) => {
  if (request.body && typeof request.body === 'object' && 'tenantId' in request.body) {
    throw new HttpError(400, 'BODY_TENANT_ID_NOT_ALLOWED', 'Choose the workspace using X-Tenant-Id, not the request body.');
  }
  const input = previewSchema.parse(request.body);
  const apiRequest = request as ApiRequest;
  const key = idempotencyKey(apiRequest);
  if (key) {
    const existing = await ImportJob.findOne({ tenantId: apiRequest.tenant!.tenantId, idempotencyKey: key });
    if (existing) return response.json({ reused: true, job: serializeJob(existing) });
  }

  let csv: { headers: string[]; rows: Record<string, string>[] };
  try {
    csv = parseCsv(input.csv);
  } catch (error) {
    throw new HttpError(400, 'INVALID_CSV', error instanceof Error ? error.message : 'CSV could not be parsed.');
  }
  if (csv.rows.length > 1000) throw new HttpError(400, 'IMPORT_TOO_LARGE', 'A student import may contain at most 1,000 rows.');
  const requiredHeaders = ['studentNo', 'fullName'].map((field) => input.mapping?.[field as 'studentNo' | 'fullName'] ?? field);
  const errors: PreviewError[] = requiredHeaders.filter((header) => !csv.headers.includes(header)).map((header) => ({
    row: 1, field: header, message: 'Required column is missing from the CSV header.',
  }));
  Object.entries(input.mapping ?? {}).forEach(([field, header]) => {
    if (!csv.headers.includes(header)) errors.push({ row: 1, field, message: `Mapped column "${header}" is missing from the CSV header.` });
  });
  const rows: ImportStudent[] = [];
  const rowNumbers = new Map<string, number>();
  const seenStudentNumbers = new Set<string>();
  csv.rows.forEach((row, index) => {
    const candidate = {
      studentNo: getCell(row, input.mapping, 'studentNo') ?? '',
      fullName: getCell(row, input.mapping, 'fullName') ?? '',
      email: getCell(row, input.mapping, 'email') ?? '',
      department: getCell(row, input.mapping, 'department') ?? '',
      campus: getCell(row, input.mapping, 'campus') ?? '',
      status: getCell(row, input.mapping, 'status') || 'prospective',
    };
    const parsed = importStudentSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue) => ({ row: index + 2, field: issue.path.join('.'), message: issue.message })));
      return;
    }
    if (seenStudentNumbers.has(parsed.data.studentNo)) {
      errors.push({ row: index + 2, field: 'studentNo', message: 'studentNo is duplicated in this import.' });
      return;
    }
    seenStudentNumbers.add(parsed.data.studentNo);
    rowNumbers.set(parsed.data.studentNo, index + 2);
    rows.push(parsed.data);
  });
  const existingNumbers = await Student.find({ tenantId: apiRequest.tenant!.tenantId, studentNo: { $in: rows.map((row) => row.studentNo) } }).select('studentNo');
  const existingSet = new Set(existingNumbers.map((student) => student.studentNo));
  rows.forEach((row, index) => {
    if (existingSet.has(row.studentNo)) errors.push({ row: rowNumbers.get(row.studentNo) ?? index + 2, field: 'studentNo', message: 'A student with this number already exists in the workspace.' });
  });
  const job = await ImportJob.create({
    tenantId: apiRequest.tenant!.tenantId,
    createdBy: apiRequest.auth!.userId,
    kind: 'students',
    validRows: rows,
    issues: errors,
    summary: { received: csv.rows.length, valid: rows.length, invalid: errors.length, headers: csv.headers },
    idempotencyKey: key ?? null,
  });
  await AuditEvent.create({
    tenantId: apiRequest.tenant!.tenantId, actorUserId: apiRequest.auth!.userId,
    action: 'student_import.previewed', resourceType: 'import_job', resourceId: job._id.toString(), correlationId: apiRequest.correlationId,
  });
  response.status(201).json({ reused: false, job: serializeJob(job) });
}));

importsRouter.post('/imports/students/:id/commit', requirePermissions('imports.manage'), asyncRoute(async (request, response) => {
  if (!isValidObjectId(request.params.id)) throw new HttpError(400, 'INVALID_ID', 'The import job ID is invalid.');
  const apiRequest = request as ApiRequest;
  const job = await ImportJob.findOne({ _id: request.params.id, tenantId: apiRequest.tenant!.tenantId, kind: 'students' });
  if (!job) throw new HttpError(404, 'IMPORT_NOT_FOUND', 'Import job not found.');
  if (job.status === 'completed') return response.json({ job: serializeJob(job), reused: true });
  if (job.status !== 'previewed') throw new HttpError(409, 'IMPORT_NOT_READY', 'This import cannot be committed.');
  if (job.issues.length > 0) throw new HttpError(409, 'IMPORT_HAS_ERRORS', 'Resolve the preview errors before committing this import.', job.issues);
  const rows = z.array(importStudentSchema).parse(job.validRows);
  const conflicts = await Student.exists({ tenantId: apiRequest.tenant!.tenantId, studentNo: { $in: rows.map((row) => row.studentNo) } });
  if (conflicts) {
    job.status = 'failed';
    job.issues = [{ row: 0, field: 'studentNo', message: 'Student records changed after preview. Create a new preview and retry.' }];
    job.summary = { ...job.summary as Record<string, unknown>, committed: 0, invalid: 1 };
    await job.save();
    throw new HttpError(409, 'IMPORT_STALE', 'Student records changed after preview. Create a new preview and retry.');
  }
  await Student.insertMany(rows.map((row) => ({
    ...row,
    tenantId: apiRequest.tenant!.tenantId,
    createdBy: apiRequest.auth!.userId,
    statusHistory: [{ status: row.status, actorUserId: apiRequest.auth!.userId, changedAt: new Date() }],
  })), { ordered: true });
  job.status = 'completed';
  job.summary = { ...job.summary as Record<string, unknown>, committed: rows.length };
  await job.save();
  await AuditEvent.create({
    tenantId: apiRequest.tenant!.tenantId, actorUserId: apiRequest.auth!.userId,
    action: 'student_import.completed', resourceType: 'import_job', resourceId: job._id.toString(), correlationId: apiRequest.correlationId,
    metadata: { created: rows.length },
  });
  response.json({ job: serializeJob(job), reused: false });
}));

importsRouter.get('/exports/students.csv', requirePermissions('students.read'), asyncRoute(async (request, response) => {
  const input = listQuerySchema.parse(request.query);
  const apiRequest = request as ApiRequest;
  const filter: Record<string, unknown> = { tenantId: apiRequest.tenant!.tenantId };
  if (input.status) filter.status = input.status;
  if (input.q) {
    const escaped = input.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ studentNo: expression }, { fullName: expression }, { email: expression }];
  }
  const students = await Student.find(filter).sort({ studentNo: 1 }).limit(10_000).select('studentNo fullName email department campus status');
  const headers = ['studentNo', 'fullName', 'email', 'department', 'campus', 'status'];
  response.type('text/csv').attachment('ricozedu-students.csv').send(toCsv(headers, students.map((student) => ({
    studentNo: student.studentNo, fullName: student.fullName, email: student.email ?? '', department: student.department ?? '', campus: student.campus ?? '', status: student.status,
  }))));
}));
