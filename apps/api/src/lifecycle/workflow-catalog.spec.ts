import {
  WORKFLOW_SPECS,
  assertTransition,
  isTerminal,
} from './workflow-catalog';

describe('workflow catalog & transitions', () => {
  it('defines all 12 lifecycle workflows', () => {
    expect(Object.keys(WORKFLOW_SPECS)).toHaveLength(12);
  });

  it('every workflow has required operational fields', () => {
    for (const spec of Object.values(WORKFLOW_SPECS)) {
      expect(spec.trigger).toBeTruthy();
      expect(spec.preconditions.length).toBeGreaterThan(0);
      expect(spec.actors.length).toBeGreaterThan(0);
      expect(spec.transitions.length).toBeGreaterThan(0);
      expect(spec.transactionBoundary).toBeTruthy();
      expect(spec.idempotencyKeyPattern).toContain(spec.code);
      expect(spec.retryBehavior).toBeTruthy();
      expect(spec.compensationBehavior).toBeTruthy();
      expect(spec.auditActions.length).toBeGreaterThan(0);
      expect(spec.requiredPermission).toBeTruthy();
      expect(spec.expiredDelegatedPermissionBehavior).toBeTruthy();
      expect(spec.tenantScopeChecks.length).toBeGreaterThan(0);
      expect(spec.failureRecovery).toBeTruthy();
      expect(spec.manualRepairPath).toBeTruthy();
      expect(spec.metrics.length).toBeGreaterThan(0);
      expect(spec.domainEvents.length).toBeGreaterThan(0);
      expect(spec.notifications.length).toBeGreaterThan(0);
    }
  });

  it('allows valid transitions and rejects invalid ones', () => {
    const spec = WORKFLOW_SPECS.course_registration;
    const t = assertTransition(spec, 'registration_requested', 'CheckEligibility');
    expect(t.to).toBe('eligibility_checked');
    expect(() =>
      assertTransition(spec, 'registration_requested', 'ConfirmRegistration'),
    ).toThrow(/Invalid transition/);
  });

  it('recognizes terminal states', () => {
    const spec = WORKFLOW_SPECS.examination_to_result;
    expect(isTerminal(spec, 'results_published')).toBe(true);
    expect(isTerminal(spec, 'exam_scheduled')).toBe(false);
  });

  it('examination publish path does not skip moderation', () => {
    const spec = WORKFLOW_SPECS.examination_to_result;
    expect(() =>
      assertTransition(spec, 'exam_conducted', 'PublishResults'),
    ).toThrow();
    const moderated = assertTransition(spec, 'results_moderated', 'PublishResults');
    expect(moderated.to).toBe('results_published');
  });
});
