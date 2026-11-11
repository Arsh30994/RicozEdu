import { hasPermission } from './middleware';

describe('Express tenant permissions', () => {
  it('gives an owner full access and limits a student to self-service reads', () => {
    expect(hasPermission('owner', [], 'privacy.manage')).toBe(true);
    expect(hasPermission('student', [], 'students.read.self')).toBe(true);
    expect(hasPermission('student', [], 'students.read')).toBe(false);
  });

  it('accepts a tenant-local wildcard permission', () => {
    expect(hasPermission('guardian', ['students.*'], 'students.read')).toBe(true);
  });
});
