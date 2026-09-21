export type StudentStatus =
  | 'prospective'
  | 'active'
  | 'inactive'
  | 'graduated'
  | 'withdrawn'
  | 'suspended';

const ALLOWED: Record<StudentStatus, StudentStatus[]> = {
  prospective: ['active'],
  active: ['inactive', 'suspended', 'withdrawn', 'graduated'],
  suspended: ['active'],
  inactive: ['active'],
  graduated: [],
  withdrawn: [],
};

export function canTransition(
  from: StudentStatus,
  to: StudentStatus,
): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: StudentStatus, to: StudentStatus): void {
  if (!canTransition(from, to)) {
    const err = new Error(`Invalid status transition ${from} -> ${to}`);
    (err as Error & { code: string }).code = 'INVALID_STATUS_TRANSITION';
    throw err;
  }
}
