import {
  computeDegreeProgress,
  CurriculumRequirement,
  CourseGroupDef,
  ExitAwardDef,
} from './rules/degree-progress';
import { EVALUATOR_VERSION, evaluateRuleDocument } from './rules/rule-evaluator';
import {
  validatePrerequisiteGraph,
  PrerequisiteGroupInput,
} from './rules/prerequisite-graph';
import { explainRegistrationEligibility } from './rules/registration-explainer';
import {
  simulateCurriculumChange,
  CurriculumSnapshot,
  StudentCurriculumSnapshot,
} from './simulation/simulation-engine';
import { HttpStatus, Injectable } from '@nestjs/common';
import { RuleDocument, RuleDocumentSchema } from '@ricozedu/shared-types';
import { DatabaseService } from '../database/database.service';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';
import { ApiError } from '../common/api-error';
import { PoolClient } from 'pg';

@Injectable()
export class AcademicsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async createProgrammeVersion(input: {
    tenantId: string;
    userId: string;
    membershipId: string;
    correlationId: string;
    programmeId: string;
    versionLabel: string;
    effectiveFrom: string;
    totalCredits: number;
    rulesDocument?: RuleDocument;
    nepConfig?: Record<string, unknown>;
    cbcsConfig?: Record<string, unknown>;
  }) {
    if (input.rulesDocument) RuleDocumentSchema.parse(input.rulesDocument);
    return this.db.withTenantTx(input.tenantId, input.userId, async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO programme_versions (
           tenant_id, programme_id, version_label, status, effective_from,
           total_credits, rules_document, nep_config, cbcs_config, created_by
         ) VALUES ($1,$2,$3,'draft',$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)
         RETURNING id`,
        [
          input.tenantId,
          input.programmeId,
          input.versionLabel,
          input.effectiveFrom,
          input.totalCredits,
          JSON.stringify(input.rulesDocument ?? { version: '1' }),
          JSON.stringify(input.nepConfig ?? {}),
          JSON.stringify(input.cbcsConfig ?? {}),
          input.userId,
        ],
      );
      const id = r.rows[0]!.id;
      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.userId,
        actorMembershipId: input.membershipId,
        action: 'programme_version.created',
        resourceType: 'programme_version',
        resourceId: id,
        correlationId: input.correlationId,
        metadata: { versionLabel: input.versionLabel },
      });
      await this.outbox.write(client, {
        tenantId: input.tenantId,
        aggregateType: 'programme_version',
        aggregateId: id,
        eventType: 'programme_version.created',
        payload: { id },
        idempotencyKey: `programme_version.created:${id}`,
      });
      return { id, status: 'draft' };
    });
  }

  async publishProgrammeVersion(input: {
    tenantId: string;
    userId: string;
    membershipId: string;
    correlationId: string;
    programmeVersionId: string;
    runSimulation?: boolean;
  }) {
    return this.db.withTenantTx(input.tenantId, input.userId, async (client) => {
      const groups = await this.loadPrereqGroups(
        client,
        input.tenantId,
        input.programmeVersionId,
      );
      const graph = validatePrerequisiteGraph(groups);
      if (!graph.valid) {
        throw new ApiError(
          'PREREQ_CYCLE',
          graph.explanation,
          HttpStatus.UNPROCESSABLE_ENTITY,
          { cycles: graph.cycles },
        );
      }

      let simulation: Record<string, unknown> = { skipped: input.runSimulation === false };
      if (input.runSimulation !== false) {
        const sim = await this.simulateEnrolments(
          client,
          input.tenantId,
          input.programmeVersionId,
        );
        simulation = {
          affectedCount: sim.affectedStudentsCount,
          explanation: sim.summaryExplanation,
          sample: sim.deltas.slice(0, 25),
        };
        await client.query(
          `INSERT INTO curriculum_simulations (
             tenant_id, programme_version_id, curriculum_version_id, status,
             requested_by, result_summary, affected_students_count, completed_at
           )
           SELECT $1, $2, cv.id, 'completed', $3, $4::jsonb, $5, now()
           FROM curriculum_versions cv
           WHERE cv.programme_version_id = $2 AND cv.tenant_id = $1
           ORDER BY cv.created_at DESC LIMIT 1`,
          [
            input.tenantId,
            input.programmeVersionId,
            input.userId,
            JSON.stringify(simulation),
            sim.affectedStudentsCount,
          ],
        );
      }

      const pub = await client.query(
        `UPDATE programme_versions
         SET status = 'published', published_at = now(), published_by = $2, updated_at = now()
         WHERE id = $1 AND status = 'draft' RETURNING id`,
        [input.programmeVersionId, input.userId],
      );
      if (!pub.rows[0]) {
        throw new ApiError(
          'NOT_FOUND',
          'Programme version not found or not in draft status',
          HttpStatus.NOT_FOUND,
        );
      }

      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.userId,
        actorMembershipId: input.membershipId,
        action: 'programme_version.published',
        resourceType: 'programme_version',
        resourceId: input.programmeVersionId,
        correlationId: input.correlationId,
        metadata: { simulation },
      });
      await this.outbox.write(client, {
        tenantId: input.tenantId,
        aggregateType: 'programme_version',
        aggregateId: input.programmeVersionId,
        eventType: 'programme_version.published',
        payload: { id: input.programmeVersionId },
        idempotencyKey: `programme_version.published:${input.programmeVersionId}`,
      });

      return {
        id: input.programmeVersionId,
        status: 'published',
        prerequisiteValidation: graph,
        simulation,
      };
    });
  }

  async publishCurriculumVersion(input: {
    tenantId: string;
    userId: string;
    membershipId: string;
    correlationId: string;
    curriculumVersionId: string;
  }) {
    return this.db.withTenantTx(input.tenantId, input.userId, async (client) => {
      const cur = await client.query<{
        id: string;
        programme_version_id: string;
        status: string;
      }>(
        `SELECT id, programme_version_id, status FROM curriculum_versions WHERE id = $1`,
        [input.curriculumVersionId],
      );
      const row = cur.rows[0];
      if (!row || row.status !== 'draft') {
        throw new ApiError('NOT_FOUND', 'Curriculum version not draft', HttpStatus.NOT_FOUND);
      }
      const groups = await this.loadPrereqGroups(
        client,
        input.tenantId,
        row.programme_version_id,
      );
      const graph = validatePrerequisiteGraph(groups);
      if (!graph.valid) {
        throw new ApiError(
          'PREREQ_CYCLE',
          graph.explanation,
          HttpStatus.UNPROCESSABLE_ENTITY,
          { cycles: graph.cycles },
        );
      }
      const sim = await this.simulateEnrolments(
        client,
        input.tenantId,
        row.programme_version_id,
        input.curriculumVersionId,
      );
      await client.query(
        `INSERT INTO curriculum_simulations (
           tenant_id, programme_version_id, curriculum_version_id, status,
           requested_by, result_summary, affected_students_count, completed_at
         ) VALUES ($1,$2,$3,'completed',$4,$5::jsonb,$6,now())`,
        [
          input.tenantId,
          row.programme_version_id,
          input.curriculumVersionId,
          input.userId,
          JSON.stringify({
            affectedCount: sim.affectedStudentsCount,
            explanation: sim.summaryExplanation,
            sample: sim.deltas.slice(0, 25),
          }),
          sim.affectedStudentsCount,
        ],
      );
      await client.query(
        `UPDATE curriculum_versions
         SET status = 'published', published_at = now(), published_by = $2, updated_at = now()
         WHERE id = $1 AND status = 'draft'`,
        [input.curriculumVersionId, input.userId],
      );
      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.userId,
        actorMembershipId: input.membershipId,
        action: 'curriculum_version.published',
        resourceType: 'curriculum_version',
        resourceId: input.curriculumVersionId,
        correlationId: input.correlationId,
        metadata: { affectedCount: sim.affectedStudentsCount },
      });
      return {
        id: input.curriculumVersionId,
        status: 'published',
        simulation: {
          affectedCount: sim.affectedStudentsCount,
          explanation: sim.summaryExplanation,
          sample: sim.deltas.slice(0, 25),
        },
        prerequisiteValidation: graph,
      };
    });
  }

  async checkRegistration(input: {
    tenantId: string;
    userId: string;
    membershipId: string;
    correlationId: string;
    studentMembershipId: string;
    courseVersionId: string;
  }) {
    return this.db.withTenantTx(input.tenantId, input.userId, async (client) => {
      const groups = await client.query<{ id: string; logic: 'AND' | 'OR' }>(
        `SELECT id, logic FROM prerequisite_groups
         WHERE tenant_id = $1 AND course_version_id = $2`,
        [input.tenantId, input.courseVersionId],
      );
      const fullGroups = [];
      for (const g of groups.rows) {
        const items = await client.query<{
          required_course_version_id: string | null;
          required_course_id: string | null;
        }>(
          `SELECT required_course_version_id, required_course_id
           FROM prerequisite_group_items WHERE prerequisite_group_id = $1`,
          [g.id],
        );
        fullGroups.push({
          id: g.id,
          courseVersionId: input.courseVersionId,
          logic: g.logic,
          sortOrder: 0,
          items: items.rows.map((i) => ({
            id: `${g.id}:${i.required_course_version_id ?? i.required_course_id ?? 'x'}`,
            requiredCourseVersionId: i.required_course_version_id,
            requiredCourseId: i.required_course_id,
          })),
        });
      }
      const completed = await client.query<{
        course_version_id: string;
        course_id: string;
      }>(
        `SELECT ca.course_version_id, cv.course_id
         FROM course_attempts ca
         JOIN course_versions cv ON cv.id = ca.course_version_id
         WHERE ca.tenant_id = $1 AND ca.student_membership_id = $2 AND ca.status = 'completed'`,
        [input.tenantId, input.studentMembershipId],
      );
      const completedVersions = new Set(completed.rows.map((r) => r.course_version_id));
      const completedCourses = new Set(completed.rows.map((r) => r.course_id));
      const waivers = await client.query<{ course_version_id: string }>(
        `SELECT course_version_id FROM course_waivers
         WHERE tenant_id = $1 AND student_membership_id = $2 AND status = 'approved'`,
        [input.tenantId, input.studentMembershipId],
      );
      const waived = new Set(waivers.rows.map((w) => w.course_version_id));
      const credit = await client.query<{ credit_value: string }>(
        `SELECT credit_value::text FROM course_versions WHERE id = $1`,
        [input.courseVersionId],
      );
      const coreqIds = await client.query<{ required_course_version_id: string }>(
        `SELECT required_course_version_id FROM corequisites
         WHERE course_version_id = $1 AND tenant_id = $2`,
        [input.courseVersionId, input.tenantId],
      );
      const course = await client.query<{ code: string; title: string }>(
        `SELECT c.code, c.title FROM course_versions cv
         JOIN courses c ON c.id = cv.course_id WHERE cv.id = $1`,
        [input.courseVersionId],
      );
      const explained = explainRegistrationEligibility({
        courseVersionId: input.courseVersionId,
        courseCode: course.rows[0]?.code,
        courseTitle: course.rows[0]?.title,
        creditValue: Number(credit.rows[0]?.credit_value ?? 0),
        currentTermCredits: 0,
        prerequisiteGroups: fullGroups as PrerequisiteGroupInput[],
        corequisiteCourseVersionIds: coreqIds.rows.map((r) => r.required_course_version_id),
        completedCourseVersionIds: [...completedVersions],
        completedCourseIds: [...completedCourses],
        registeredThisTermCourseVersionIds: [],
        waivedCourseVersionIds: [...waived],
      });
      await client.query(
        `INSERT INTO rule_evaluation_decisions (
           tenant_id, student_membership_id, decision_type, subject_ref,
           rule_version_refs, result, explanation, details, created_by
         ) VALUES ($1,$2,'registration',$3::jsonb,$4::jsonb,$5,$6,$7::jsonb,$8)`,
        [
          input.tenantId,
          input.studentMembershipId,
          JSON.stringify({ courseVersionId: input.courseVersionId }),
          JSON.stringify({
            evaluatorVersion: EVALUATOR_VERSION,
            courseVersionId: input.courseVersionId,
          }),
          explained.eligible ? 'pass' : 'fail',
          explained.explanation,
          JSON.stringify({ failures: explained.failures, details: explained.details }),
          input.userId,
        ],
      );
      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.userId,
        actorMembershipId: input.membershipId,
        action: explained.eligible
          ? 'registration.check.passed'
          : 'registration.check.failed',
        resourceType: 'course_version',
        resourceId: input.courseVersionId,
        correlationId: input.correlationId,
        metadata: { studentMembershipId: input.studentMembershipId },
      });
      return explained;
    });
  }

  async getDegreeProgress(input: {
    tenantId: string;
    userId: string;
    studentMembershipId: string;
    programmeEnrolmentId: string;
  }) {
    return this.db.withTenantTx(input.tenantId, input.userId, async (client) => {
      const enr = await client.query<{
        programme_version_id: string;
        curriculum_version_id: string | null;
      }>(
        `SELECT programme_version_id, curriculum_version_id
         FROM programme_enrolments WHERE id = $1`,
        [input.programmeEnrolmentId],
      );
      const e = enr.rows[0];
      if (!e?.curriculum_version_id) {
        throw new ApiError(
          'NOT_FOUND',
          'Enrolment or pinned curriculum version not found',
          HttpStatus.NOT_FOUND,
        );
      }
      const pv = await client.query<{
        total_credits: string;
        rules_document: RuleDocument;
      }>(
        `SELECT total_credits::text, rules_document FROM programme_versions WHERE id = $1`,
        [e.programme_version_id],
      );
      const reqs = await this.loadRequirements(client, e.curriculum_version_id);
      const groups = await this.loadGroups(client, e.curriculum_version_id);
      const exits = await this.loadExits(client, e.programme_version_id);
      const completed = await this.loadCompleted(
        client,
        input.studentMembershipId,
      );
      const waivers = await client.query<{ course_version_id: string }>(
        `SELECT course_version_id FROM course_waivers
         WHERE student_membership_id = $1 AND status = 'approved'`,
        [input.studentMembershipId],
      );
      const transfers = await client.query<{ credits: string }>(
        `SELECT coalesce(sum(credits),0)::text AS credits FROM transfer_credits
         WHERE student_membership_id = $1 AND status = 'approved'`,
        [input.studentMembershipId],
      );

      const progress = computeDegreeProgress({
        programmeVersionId: e.programme_version_id,
        curriculumVersionId: e.curriculum_version_id,
        requirements: reqs,
        groups,
        completed,
        transferCredits: Number(transfers.rows[0]?.credits ?? 0),
        waivedCourseVersionIds: waivers.rows.map((w) => w.course_version_id),
        exitAwards: exits,
        totalCreditsRequired: Number(pv.rows[0]?.total_credits ?? 0),
        programmeRulesDocument: pv.rows[0]?.rules_document ?? null,
      });

      await client.query(
        `INSERT INTO rule_evaluation_decisions (
           tenant_id, student_membership_id, decision_type, subject_ref,
           rule_version_refs, result, explanation, details, created_by
         ) VALUES ($1,$2,'progress',$3::jsonb,$4::jsonb,$5,$6,$7::jsonb,$8)`,
        [
          input.tenantId,
          input.studentMembershipId,
          JSON.stringify({ programmeEnrolmentId: input.programmeEnrolmentId }),
          JSON.stringify(progress.ruleVersionRefs),
          progress.pass ? 'pass' : 'fail',
          progress.explanation,
          JSON.stringify(progress),
          input.userId,
        ],
      );

      return {
        earnedCredits: progress.totalCreditsEarned,
        remainingCredits: Math.max(
          0,
          Number(pv.rows[0]?.total_credits ?? 0) - progress.totalCreditsEarned,
        ),
        categoryBreakdown: progress.creditsByCategory,
        requiredRemaining: progress.remainingRequiredCourses.map((r) => ({
          courseVersionId: r.courseVersionId,
          category: r.category,
        })),
        groups: progress.groups.map((g) => ({
          courseGroupId: g.groupId,
          earned: g.earnedCredits,
          min: g.minCredits ?? 0,
          met: g.satisfied,
        })),
        exitEligibility: progress.exitAwards.map((x) => ({
          code: x.code,
          name: x.name,
          eligible: x.eligible,
          explanation: x.explanation,
        })),
        progression: {
          pass: progress.pass,
          explanation: progress.explanation,
        },
        ruleVersionRefs: progress.ruleVersionRefs,
      };
    });
  }

  evaluateLocal(doc: RuleDocument, snap: Parameters<typeof evaluateRuleDocument>[1]) {
    return evaluateRuleDocument(RuleDocumentSchema.parse(doc), snap);
  }

  private async loadPrereqGroups(
    client: PoolClient,
    tenantId: string,
    programmeVersionId: string,
  ): Promise<PrerequisiteGroupInput[]> {
    const groups = await client.query<{
      id: string;
      course_version_id: string;
      logic: 'AND' | 'OR';
      sort_order: number;
    }>(
      `SELECT pg.id, pg.course_version_id, pg.logic, coalesce(pg.sort_order, 0) AS sort_order
       FROM prerequisite_groups pg
       JOIN course_versions cv_from ON cv_from.id = pg.course_version_id
       JOIN curriculum_course_requirements ccr ON ccr.course_version_id = cv_from.id
       JOIN curriculum_versions cur ON cur.id = ccr.curriculum_version_id
       WHERE cur.programme_version_id = $1 AND pg.tenant_id = $2`,
      [programmeVersionId, tenantId],
    );
    const result: PrerequisiteGroupInput[] = [];
    for (const g of groups.rows) {
      const items = await client.query<{
        id: string;
        required_course_version_id: string | null;
        required_course_id: string | null;
        department_id: string | null;
      }>(
        `SELECT id, required_course_version_id, required_course_id, department_id
         FROM prerequisite_group_items WHERE prerequisite_group_id = $1`,
        [g.id],
      );
      result.push({
        id: g.id,
        courseVersionId: g.course_version_id,
        logic: g.logic,
        sortOrder: g.sort_order,
        items: items.rows.map((i) => ({
          id: i.id,
          requiredCourseVersionId: i.required_course_version_id,
          requiredCourseId: i.required_course_id,
          departmentId: i.department_id,
        })),
      });
    }
    return result;
  }

  private async loadRequirements(
    client: PoolClient,
    curriculumVersionId: string,
  ): Promise<CurriculumRequirement[]> {
    const reqs = await client.query<{
      course_version_id: string;
      course_id: string;
      category: string;
      credits: string;
      is_required: boolean;
      course_group_id: string | null;
    }>(
      `SELECT ccr.course_version_id, cv.course_id, ccr.category,
              coalesce(ccr.credits_override, cv.credit_value)::text AS credits,
              ccr.is_required, ccr.course_group_id
       FROM curriculum_course_requirements ccr
       JOIN course_versions cv ON cv.id = ccr.course_version_id
       WHERE ccr.curriculum_version_id = $1`,
      [curriculumVersionId],
    );
    return reqs.rows.map((r) => ({
      courseVersionId: r.course_version_id,
      courseId: r.course_id,
      category: r.category,
      credits: Number(r.credits),
      isRequired: r.is_required,
      courseGroupId: r.course_group_id,
    }));
  }

  private async loadGroups(
    client: PoolClient,
    curriculumVersionId: string,
  ): Promise<CourseGroupDef[]> {
    const groups = await client.query<{
      id: string;
      code: string;
      name: string;
      min_credits: string;
    }>(
      `SELECT id, code, name, min_credits::text FROM course_groups
       WHERE curriculum_version_id = $1`,
      [curriculumVersionId],
    );
    return groups.rows.map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      minCredits: Number(g.min_credits),
    }));
  }

  private async loadExits(
    client: PoolClient,
    programmeVersionId: string,
  ): Promise<ExitAwardDef[]> {
    const exits = await client.query<{
      code: string;
      name: string;
      min_credits: string;
      rule_document: RuleDocument;
      award_level: string;
    }>(
      `SELECT code, name, min_credits::text, rule_document, award_level
       FROM exit_awards WHERE programme_version_id = $1`,
      [programmeVersionId],
    );
    return exits.rows.map((x) => ({
      code: x.code,
      name: x.name,
      minCredits: Number(x.min_credits),
      ruleDocument: x.rule_document,
      awardLevel: x.award_level,
    }));
  }

  private async loadCompleted(client: PoolClient, studentMembershipId: string) {
    const attempts = await client.query<{
      course_version_id: string;
      course_id: string;
      category: string;
      credits: string;
      letter_grade: string | null;
      status: string;
    }>(
      `SELECT ca.course_version_id, cv.course_id, cv.course_category AS category,
              cv.credit_value::text AS credits, ca.letter_grade, ca.status
       FROM course_attempts ca
       JOIN course_versions cv ON cv.id = ca.course_version_id
       WHERE ca.student_membership_id = $1 AND ca.status = 'completed'`,
      [studentMembershipId],
    );
    return attempts.rows.map((a) => ({
      courseId: a.course_id,
      courseVersionId: a.course_version_id,
      category: a.category,
      credits: Number(a.credits),
      grade: a.letter_grade,
    }));
  }

  private async simulateEnrolments(
    client: PoolClient,
    tenantId: string,
    programmeVersionId: string,
    proposedCurriculumVersionId?: string,
  ) {
    const enrolments = await client.query<{
      student_membership_id: string;
      curriculum_version_id: string | null;
    }>(
      `SELECT student_membership_id, curriculum_version_id
       FROM programme_enrolments
       WHERE programme_version_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [programmeVersionId, tenantId],
    );
    const proposedId =
      proposedCurriculumVersionId ??
      (
        await client.query<{ id: string }>(
          `SELECT id FROM curriculum_versions
           WHERE programme_version_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [programmeVersionId],
        )
      ).rows[0]?.id;
    if (!proposedId) {
      return simulateCurriculumChange(
        {
          programmeVersionId,
          curriculumVersionId: programmeVersionId,
          requirements: [],
          groups: [],
          exitAwards: [],
        },
        {
          programmeVersionId,
          curriculumVersionId: programmeVersionId,
          requirements: [],
          groups: [],
          exitAwards: [],
        },
        [],
      );
    }

    const publishedReqs = await this.loadRequirements(
      client,
      enrolments.rows[0]?.curriculum_version_id ?? proposedId,
    );
    const draftReqs = await this.loadRequirements(client, proposedId);
    const groups = await this.loadGroups(client, proposedId);
    const exits = await this.loadExits(client, programmeVersionId);

    const published: CurriculumSnapshot = {
      programmeVersionId,
      curriculumVersionId: enrolments.rows[0]?.curriculum_version_id ?? proposedId,
      requirements: publishedReqs,
      groups,
      exitAwards: exits,
    };
    const draft: CurriculumSnapshot = {
      programmeVersionId,
      curriculumVersionId: proposedId,
      requirements: draftReqs,
      groups,
      exitAwards: exits,
    };

    const students: StudentCurriculumSnapshot[] = [];
    for (const en of enrolments.rows) {
      const completed = await this.loadCompleted(client, en.student_membership_id);
      students.push({
        studentMembershipId: en.student_membership_id,
        completed,
        transferCredits: 0,
        waivedCourseVersionIds: [],
      });
    }
    return simulateCurriculumChange(published, draft, students);
  }
}
