import { Router, type Router as ExpressRouter } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import {
  AcademicPeriod, Assignment, AssignmentSubmission, AttendanceRecord, AuditEvent,
  ClassGroup, Course, Membership, Student, TimetableEntry,
} from './models';
import { ApiRequest, asyncRoute, HttpError } from './http';
import { requirePermissions, requireTenant } from './middleware';
import { dateRangesOverlap, timesOverlap } from './academic-rules';

const id = z.string().refine(isValidObjectId, 'A valid resource ID is required.');
const classSchema = z.object({
  courseId: id,
  academicPeriodId: id,
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  teacherUserId: id,
  studentIds: z.array(id).max(500).default([]),
  room: z.string().trim().max(80).default(''),
}).strict();
const timetableSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
  endTime: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
  room: z.string().trim().max(80).default(''),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date(),
}).strict().superRefine((value, context) => {
  if (value.startTime >= value.endTime) context.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'End time must be after start time.' });
  if (value.effectiveUntil < value.effectiveFrom) context.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveUntil'], message: 'End date must not precede start date.' });
});
const attendanceSchema = z.object({
  date: z.coerce.date(),
  records: z.array(z.object({
    studentId: id,
    status: z.enum(['present', 'absent', 'late', 'excused']),
    note: z.string().trim().max(500).default(''),
  }).strict()).min(1).max(500),
}).strict();
const assignmentSchema = z.object({
  title: z.string().trim().min(2).max(160),
  instructions: z.string().trim().max(10000).default(''),
  dueAt: z.coerce.date(),
  maxScore: z.number().min(0).max(10000).default(100),
  status: z.enum(['draft', 'published']).default('published'),
}).strict();
const submissionSchema = z.object({
  text: z.string().trim().max(20000).default(''),
  attachmentUrl: z.string().url().max(2000).optional().or(z.literal('')),
}).strict().refine((value) => value.text.length > 0 || Boolean(value.attachmentUrl), 'Provide written work or an attachment.');
const gradeSchema = z.object({
  score: z.number().min(0).max(10000),
  feedback: z.string().trim().max(5000).default(''),
}).strict();

function rejectTenantOverride(body: unknown) {
  if (body && typeof body === 'object' && 'tenantId' in body) {
    throw new HttpError(400, 'BODY_TENANT_ID_NOT_ALLOWED', 'Workspace scope is selected using X-Tenant-Id.');
  }
}
function assertAcademicPortalRole(request: ApiRequest): void {
  if (!['owner', 'admin', 'faculty', 'student'].includes(context(request).role)) {
    throw new HttpError(403, 'FORBIDDEN', 'This academic workflow is not available to your institution role.');
  }
}
function context(request: ApiRequest) { return request.tenant!; }
function actor(request: ApiRequest) { return request.auth!.userId; }
function serialize(doc: { _id: Types.ObjectId; toObject(): Record<string, unknown> }) {
  const { _id: _id, __v: _v, ...rest } = doc.toObject();
  return { id: _id.toString(), ...rest };
}
async function loadClass(request: ApiRequest, classId: string) {
  assertAcademicPortalRole(request);
  if (!isValidObjectId(classId)) throw new HttpError(400, 'INVALID_ID', 'The class ID is invalid.');
  const filter: Record<string, unknown> = { _id: classId, tenantId: context(request).tenantId, status: 'active' };
  if (context(request).role === 'faculty') filter.teacherUserId = actor(request);
  if (context(request).role === 'student') filter.studentIds = { $in: await Student.find({ tenantId: context(request).tenantId, userId: actor(request) }).distinct('_id') };
  const group = await ClassGroup.findOne(filter);
  if (!group) throw new HttpError(404, 'CLASS_NOT_FOUND', 'Class not found or you do not have access to it.');
  return group;
}
async function audit(request: ApiRequest, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  await AuditEvent.create({
    tenantId: context(request).tenantId, actorUserId: actor(request), action, resourceType,
    resourceId, correlationId: request.correlationId, metadata,
  });
}

export const academicsRouter: ExpressRouter = Router();
academicsRouter.use(requireTenant);

academicsRouter.get('/classes', asyncRoute(async (request, response) => {
  const req = request as ApiRequest;
  assertAcademicPortalRole(req);
  const filter: Record<string, unknown> = { tenantId: context(req).tenantId, status: 'active' };
  if (context(req).role === 'faculty') filter.teacherUserId = actor(req);
  if (context(req).role === 'student') {
    const studentIds = await Student.find({ tenantId: context(req).tenantId, userId: actor(req), status: 'active' }).distinct('_id');
    filter.studentIds = { $in: studentIds };
  }
  const rows = await ClassGroup.find(filter).sort({ name: 1 }).populate('courseId', 'code name credits').populate('academicPeriodId', 'name startDate endDate').populate('teacherUserId', 'fullName email');
  response.json({ items: rows.map(serialize) });
}));

academicsRouter.post('/classes', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectTenantOverride(request.body);
  const input = classSchema.parse(request.body);
  const req = request as ApiRequest;
  const [course, period, teacher, students] = await Promise.all([
    Course.exists({ _id: input.courseId, tenantId: context(req).tenantId, status: 'active' }),
    AcademicPeriod.exists({ _id: input.academicPeriodId, tenantId: context(req).tenantId }),
    Membership.exists({ tenantId: context(req).tenantId, userId: input.teacherUserId, role: 'faculty', status: 'active' }),
    Student.find({ _id: { $in: input.studentIds }, tenantId: context(req).tenantId, status: 'active' }).select('_id'),
  ]);
  if (!course || !period) throw new HttpError(404, 'ACADEMIC_RESOURCE_NOT_FOUND', 'The course and academic period must exist in this institution.');
  if (context(req).role === 'faculty' && input.teacherUserId !== actor(req).toString()) throw new HttpError(403, 'CLASS_TEACHER_ASSIGNMENT_FORBIDDEN', 'Faculty can only create classes assigned to themselves.');
  if (!teacher) throw new HttpError(400, 'FACULTY_MEMBERSHIP_REQUIRED', 'The assigned teacher must have an active faculty membership in this institution.');
  if (new Set(input.studentIds).size !== input.studentIds.length || students.length !== input.studentIds.length) throw new HttpError(400, 'INVALID_CLASS_ROSTER', 'Every student must be an active student in this institution.');
  const group = await ClassGroup.create({ ...input, tenantId: context(req).tenantId, studentIds: students.map((student) => student._id) });
  await audit(req, 'class.created', 'class', group._id.toString(), { rosterSize: students.length });
  response.status(201).json(serialize(group));
}));

academicsRouter.get('/classes/:id/roster', asyncRoute(async (request, response) => {
  const req = request as ApiRequest;
  const group = await loadClass(req, request.params.id);
  if (context(req).role === 'student') {
    const ownStudent = await Student.findOne({ tenantId: context(req).tenantId, userId: actor(req), status: 'active' }).select('_id studentNo fullName email');
    return response.json({ items: ownStudent ? [ownStudent] : [] });
  }
  const students = await Student.find({ _id: { $in: group.studentIds }, tenantId: context(req).tenantId, status: 'active' }).select('studentNo fullName email').sort({ fullName: 1 });
  response.json({ items: students.map(student => ({ id: student._id.toString(), studentNo: student.studentNo, name: student.fullName, email: student.email ?? '' })) });
}));

academicsRouter.get('/classes/:id/timetable', asyncRoute(async (request, response) => {
  const req = request as ApiRequest;
  const group = await loadClass(req, request.params.id);
  const rows = await TimetableEntry.find({ tenantId: context(req).tenantId, classId: group._id }).sort({ dayOfWeek: 1, startTime: 1 });
  response.json({ items: rows.map(serialize) });
}));

academicsRouter.post('/classes/:id/timetable', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectTenantOverride(request.body);
  const input = timetableSchema.parse(request.body);
  const req = request as ApiRequest;
  const group = await loadClass(req, request.params.id);
  if (input.effectiveUntil < input.effectiveFrom) throw new HttpError(400, 'INVALID_DATE_RANGE', 'The timetable end date must not precede its start date.');
  const otherEntries = await TimetableEntry.find({
    tenantId: context(req).tenantId, dayOfWeek: input.dayOfWeek,
    effectiveFrom: { $lte: input.effectiveUntil }, effectiveUntil: { $gte: input.effectiveFrom },
  }).populate({ path: 'classId', select: 'teacherUserId room name studentIds' });
  for (const entry of otherEntries) {
    const other = entry.classId as unknown as { _id: Types.ObjectId; teacherUserId: Types.ObjectId; room: string; studentIds: Types.ObjectId[] };
    if (!other?._id) continue;
    const overlaps = timesOverlap(input.startTime, input.endTime, entry.startTime, entry.endTime)
      && dateRangesOverlap(input.effectiveFrom, input.effectiveUntil, entry.effectiveFrom, entry.effectiveUntil);
    if (!overlaps) continue;
    const sameTeacher = other.teacherUserId.equals(group.teacherUserId);
    const sameRoom = Boolean(input.room && (input.room === (entry.room || other.room)));
    const sameClass = other._id.equals(group._id);
    const sameStudent = (other.studentIds ?? []).some(studentId => group.studentIds.some(currentId => currentId.equals(studentId)));
    if (sameClass || sameTeacher || sameRoom || sameStudent) {
      throw new HttpError(409, 'TIMETABLE_CONFLICT', sameClass ? 'This class already has a session at that time.' : sameTeacher ? 'The assigned teacher has another class at that time.' : sameRoom ? 'The room is already allocated at that time.' : 'At least one enrolled student has another class at that time.');
    }
  }
  const entry = await TimetableEntry.create({ ...input, tenantId: context(req).tenantId, classId: group._id });
  await audit(req, 'timetable.session_created', 'timetable_entry', entry._id.toString());
  response.status(201).json(serialize(entry));
}));

academicsRouter.get('/classes/:id/attendance', asyncRoute(async (request, response) => {
  const req = request as ApiRequest;
  const group = await loadClass(req, request.params.id);
  const filter: Record<string, unknown> = { tenantId: context(req).tenantId, classId: group._id };
  if (request.query.date) {
    const date = new Date(String(request.query.date));
    if (Number.isNaN(date.getTime())) throw new HttpError(400, 'INVALID_DATE', 'Provide a valid attendance date.');
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    filter.date = { $gte: start, $lte: end };
  }
  if (context(req).role === 'student') {
    const student = await Student.findOne({ tenantId: context(req).tenantId, userId: actor(req) }).select('_id');
    if (!student || !group.studentIds.some((id) => id.equals(student._id))) throw new HttpError(403, 'FORBIDDEN', 'You are not enrolled in this class.');
    filter.studentId = student._id;
  }
  const rows = await AttendanceRecord.find(filter).sort({ date: -1 }).limit(request.query.date ? 500 : 1000).populate('studentId', 'studentNo fullName');
  response.json({ items: rows.map(serialize) });
}));

academicsRouter.put('/classes/:id/attendance', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectTenantOverride(request.body);
  const input = attendanceSchema.parse(request.body);
  const req = request as ApiRequest;
  const group = await loadClass(req, request.params.id);
  if (context(req).role === 'faculty' && !group.teacherUserId.equals(actor(req))) throw new HttpError(403, 'FORBIDDEN', 'Only the assigned teacher can mark attendance.');
  const studentIds = input.records.map((record) => record.studentId);
  if (new Set(studentIds).size !== studentIds.length) throw new HttpError(400, 'DUPLICATE_ATTENDANCE_STUDENT', 'A student may appear only once in an attendance submission.');
  const roster = new Set(group.studentIds.map((studentId) => studentId.toString()));
  if (studentIds.some((studentId) => !roster.has(studentId))) throw new HttpError(400, 'STUDENT_NOT_IN_CLASS', 'Attendance can only be marked for students on this class roster.');
  const date = new Date(input.date); date.setHours(0, 0, 0, 0);
  const operations = input.records.map((record) => ({
    updateOne: {
      filter: { tenantId: context(req).tenantId, classId: group._id, studentId: record.studentId, date },
      update: { $set: { status: record.status, note: record.note, markedBy: actor(req) }, $setOnInsert: { tenantId: context(req).tenantId, classId: group._id, studentId: record.studentId, date } },
      upsert: true,
    },
  }));
  await AttendanceRecord.bulkWrite(operations);
  await audit(req, 'attendance.saved', 'class', group._id.toString(), { date, count: input.records.length });
  response.json({ saved: input.records.length, date });
}));

academicsRouter.get('/assignments', asyncRoute(async (request, response) => {
  const req = request as ApiRequest;
  assertAcademicPortalRole(req);
  let classIds: Types.ObjectId[] = [];
  if (context(req).role === 'faculty') {
    classIds = await ClassGroup.find({ tenantId: context(req).tenantId, teacherUserId: actor(req), status: 'active' }).distinct('_id');
  } else if (context(req).role === 'student') {
    const student = await Student.findOne({ tenantId: context(req).tenantId, userId: actor(req), status: 'active' }).select('_id');
    classIds = student ? await ClassGroup.find({ tenantId: context(req).tenantId, studentIds: student._id, status: 'active' }).distinct('_id') : [];
  } else {
    classIds = await ClassGroup.find({ tenantId: context(req).tenantId, status: 'active' }).distinct('_id');
  }
  const rows = await Assignment.find({ tenantId: context(req).tenantId, classId: { $in: classIds }, ...(context(req).role === 'student' ? { status: 'published' } : {}) }).sort({ dueAt: 1 }).populate('classId', 'code name');
  response.json({ items: rows.map(serialize) });
}));

academicsRouter.post('/classes/:id/assignments', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectTenantOverride(request.body);
  const input = assignmentSchema.parse(request.body);
  const req = request as ApiRequest;
  const group = await loadClass(req, request.params.id);
  if (context(req).role === 'faculty' && !group.teacherUserId.equals(actor(req))) throw new HttpError(403, 'FORBIDDEN', 'Only the assigned teacher can create assignments for this class.');
  const assignment = await Assignment.create({ ...input, tenantId: context(req).tenantId, classId: group._id, createdBy: actor(req) });
  await audit(req, 'assignment.created', 'assignment', assignment._id.toString());
  response.status(201).json(serialize(assignment));
}));

academicsRouter.get('/assignments/:id/my-submission', asyncRoute(async (request, response) => {
  const req = request as ApiRequest;
  if (context(req).role !== 'student') throw new HttpError(403, 'FORBIDDEN', 'This endpoint is for student accounts.');
  if (!isValidObjectId(request.params.id)) throw new HttpError(400, 'INVALID_ID', 'The assignment ID is invalid.');
  const student = await Student.findOne({ tenantId: context(req).tenantId, userId: actor(req), status: 'active' }).select('_id');
  if (!student) throw new HttpError(404, 'STUDENT_PROFILE_NOT_FOUND', 'No active student profile is linked to this account.');
  const assignment = await Assignment.findOne({ _id: request.params.id, tenantId: context(req).tenantId, status: 'published' });
  if (!assignment) throw new HttpError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found or not published.');
  const group = await ClassGroup.findOne({ _id: assignment.classId, tenantId: context(req).tenantId, studentIds: student._id, status: 'active' });
  if (!group) throw new HttpError(403, 'NOT_ENROLLED', 'You are not enrolled in this class.');
  const submission = await AssignmentSubmission.findOne({ tenantId: context(req).tenantId, assignmentId: assignment._id, studentId: student._id });
  response.json({ submission: submission ? serialize(submission) : null });
}));

academicsRouter.post('/assignments/:id/submissions', asyncRoute(async (request, response) => {
  rejectTenantOverride(request.body);
  const input = submissionSchema.parse(request.body);
  const req = request as ApiRequest;
  if (context(req).role !== 'student') throw new HttpError(403, 'FORBIDDEN', 'Only students can submit their own assignment work.');
  if (!isValidObjectId(request.params.id)) throw new HttpError(400, 'INVALID_ID', 'The assignment ID is invalid.');
  const student = await Student.findOne({ tenantId: context(req).tenantId, userId: actor(req), status: 'active' }).select('_id');
  if (!student) throw new HttpError(404, 'STUDENT_PROFILE_NOT_FOUND', 'No active student profile is linked to this account.');
  const assignment = await Assignment.findOne({ _id: request.params.id, tenantId: context(req).tenantId, status: 'published' });
  if (!assignment) throw new HttpError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found or not published.');
  const group = await ClassGroup.findOne({ _id: assignment.classId, tenantId: context(req).tenantId, studentIds: student._id, status: 'active' });
  if (!group) throw new HttpError(403, 'NOT_ENROLLED', 'You are not enrolled in the class for this assignment.');
  const submission = await AssignmentSubmission.findOneAndUpdate(
    { tenantId: context(req).tenantId, assignmentId: assignment._id, studentId: student._id },
    { $set: { ...input, submittedAt: new Date() }, $setOnInsert: { tenantId: context(req).tenantId, assignmentId: assignment._id, studentId: student._id } },
    { new: true, upsert: true, runValidators: true },
  );
  await audit(req, 'assignment.submitted', 'assignment_submission', submission._id.toString());
  response.status(201).json(serialize(submission));
}));

academicsRouter.get('/assignments/:id/submissions', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  const req = request as ApiRequest;
  if (!isValidObjectId(request.params.id)) throw new HttpError(400, 'INVALID_ID', 'The assignment ID is invalid.');
  const assignment = await Assignment.findOne({ _id: request.params.id, tenantId: context(req).tenantId });
  if (!assignment) throw new HttpError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
  const group = await loadClass(req, assignment.classId.toString());
  if (context(req).role === 'faculty' && !group.teacherUserId.equals(actor(req))) throw new HttpError(403, 'FORBIDDEN', 'Only the assigned teacher can review submissions.');
  const rows = await AssignmentSubmission.find({ tenantId: context(req).tenantId, assignmentId: assignment._id }).populate('studentId', 'studentNo fullName email').sort({ submittedAt: 1 });
  response.json({ items: rows.map(serialize) });
}));

academicsRouter.patch('/assignments/:id/submissions/:submissionId/grade', requirePermissions('academics.manage'), asyncRoute(async (request, response) => {
  rejectTenantOverride(request.body);
  const input = gradeSchema.parse(request.body);
  const req = request as ApiRequest;
  if (!isValidObjectId(request.params.id) || !isValidObjectId(request.params.submissionId)) throw new HttpError(400, 'INVALID_ID', 'A submission ID is invalid.');
  const assignment = await Assignment.findOne({ _id: request.params.id, tenantId: context(req).tenantId });
  if (!assignment) throw new HttpError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
  if (input.score > assignment.maxScore) throw new HttpError(400, 'SCORE_EXCEEDS_MAX', 'The score cannot exceed the assignment maximum.');
  const group = await loadClass(req, assignment.classId.toString());
  if (context(req).role === 'faculty' && !group.teacherUserId.equals(actor(req))) throw new HttpError(403, 'FORBIDDEN', 'Only the assigned teacher can grade this assignment.');
  const submission = await AssignmentSubmission.findOneAndUpdate(
    { _id: request.params.submissionId, tenantId: context(req).tenantId, assignmentId: assignment._id },
    { $set: { score: input.score, feedback: input.feedback, gradedBy: actor(req), gradedAt: new Date() } },
    { new: true, runValidators: true },
  ).populate('studentId', 'studentNo fullName email');
  if (!submission) throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
  await audit(req, 'assignment.graded', 'assignment_submission', submission._id.toString(), { score: input.score });
  response.json(serialize(submission));
}));
