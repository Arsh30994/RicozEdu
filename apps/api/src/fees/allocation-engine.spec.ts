import { planAllocation } from './allocation-engine';

describe('planAllocation', () => {
  const account = 'acct-1';

  it('allocates FIFO by due date and returns overpayment', () => {
    const plan = planAllocation({
      paymentIntentId: 'pi-1',
      studentFeeAccountId: account,
      amountMinor: 1500,
      charges: [
        {
          id: 'c2',
          studentFeeAccountId: account,
          amountMinor: 1000,
          allocatedMinor: 0,
          dueDate: '2026-08-01',
        },
        {
          id: 'c1',
          studentFeeAccountId: account,
          amountMinor: 1000,
          allocatedMinor: 0,
          dueDate: '2026-07-01',
        },
      ],
    });
    expect(plan.items).toEqual([
      { feeChargeId: 'c1', amountMinor: 1000, allocationKey: 'pi-1:c1' },
      { feeChargeId: 'c2', amountMinor: 500, allocationKey: 'pi-1:c2' },
    ]);
    expect(plan.overpaymentMinor).toBe(0);
    expect(plan.allocatedTotal).toBe(1500);
  });

  it('rejects charges from another fee account', () => {
    expect(() =>
      planAllocation({
        paymentIntentId: 'pi-1',
        studentFeeAccountId: account,
        amountMinor: 100,
        charges: [
          {
            id: 'c1',
            studentFeeAccountId: 'other',
            amountMinor: 100,
            allocatedMinor: 0,
          },
        ],
      }),
    ).toThrow(/ALLOCATION_ACCOUNT_MISMATCH/);
  });

  it('records overpayment when payment exceeds open charges', () => {
    const plan = planAllocation({
      paymentIntentId: 'pi-2',
      studentFeeAccountId: account,
      amountMinor: 500,
      charges: [
        {
          id: 'c1',
          studentFeeAccountId: account,
          amountMinor: 200,
          allocatedMinor: 0,
          dueDate: '2026-07-01',
        },
      ],
    });
    expect(plan.allocatedTotal).toBe(200);
    expect(plan.overpaymentMinor).toBe(300);
  });
});
