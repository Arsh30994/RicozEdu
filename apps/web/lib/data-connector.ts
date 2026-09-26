import { api, loadSession } from './api';

export interface Institution {
  id: string;
  name: string;
  code: string;
  campusesCount: number;
  departmentsCount: number;
  status: 'Active' | 'Inactive' | 'Archived';
}

export interface Department {
  id: string;
  name: string;
  code: string;
  campus: string;
  admin: string;
  studentsCount: number;
  facultyName?: string;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  phone?: string;
  relation: 'Student' | 'Faculty' | 'Institution admin' | 'Department admin' | 'Staff';
  addedDate: string;
  status?: string;
}

export interface DuplicateRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  matchReason: string;
  existingRecordId: string;
  status: 'flagged' | 'reviewed' | 'merged' | 'dismissed';
}

export interface StatusHistoryItem {
  id: string;
  transition: string;
  timestamp: string;
  author: string;
  reason?: string;
}

export interface StudentMembership {
  id: string;
  studentNo: string;
  personId: string;
  name: string;
  email: string;
  department: string;
  campus: string;
  status: 'Active' | 'Invited' | 'Suspended' | 'Withdrawn' | 'Prospective' | 'Graduated';
  history: StatusHistoryItem[];
}

export interface AuditActivity {
  id: string;
  action: string;
  status: 'Success' | 'Blocked' | 'Failed' | 'Warning';
  timeAgo: string;
  timestamp: string;
  actor: string;
  resource?: string;
  details?: Record<string, unknown>;
}

export interface PendingSetupItem {
  id: string;
  title: string;
  subtitle: string;
  actionType: 'assign_admin' | 'review_duplicate' | 'confirm_timezone';
  completed?: boolean;
}

export interface UserRoleItem {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  status: 'Active' | 'Invited' | 'Disabled';
  assignedAt: string;
}

const STORAGE_KEY = 'ricozedu.app_state_v1';

const INITIAL_INSTITUTIONS: Institution[] = [
  {
    id: 'inst-1',
    name: 'GTBIT Delhi',
    code: 'GTBIT',
    campusesCount: 3,
    departmentsCount: 9,
    status: 'Active',
  },
];

const INITIAL_DEPARTMENTS: Department[] = [
  {
    id: 'dept-1',
    name: 'Computer Science & Engg.',
    code: 'CSE',
    campus: 'Main',
    admin: '—',
    studentsCount: 410,
  },
  {
    id: 'dept-2',
    name: 'Electronics & Comm.',
    code: 'ECE',
    campus: 'Main',
    admin: 'Rekha Sinha',
    studentsCount: 288,
  },
  {
    id: 'dept-3',
    name: 'Mechanical Engg.',
    code: 'ME',
    campus: 'North',
    admin: 'Unassigned',
    studentsCount: 195,
  },
  {
    id: 'dept-4',
    name: 'Information Technology',
    code: 'IT',
    campus: 'Main',
    admin: 'Amit Verma',
    studentsCount: 160,
  },
  {
    id: 'dept-5',
    name: 'Electrical Engg.',
    code: 'EE',
    campus: 'North',
    admin: 'Deepa Rao',
    studentsCount: 151,
  },
];

const INITIAL_PEOPLE: Person[] = [
  {
    id: 'p-1',
    name: 'Arshdeep Singh',
    email: 'arshdeep@gtbit.edu',
    phone: '+91 98765 43210',
    relation: 'Student',
    addedDate: '12 Sep 2026',
  },
  {
    id: 'p-2',
    name: 'Rekha Sinha',
    email: 'rekha.sinha@gtbit.edu',
    phone: '+91 98111 22334',
    relation: 'Faculty',
    addedDate: '03 Aug 2026',
  },
  {
    id: 'p-3',
    name: 'Priya Nair',
    email: 'priya.nair@gtbit.edu',
    phone: '+91 98222 33445',
    relation: 'Institution admin',
    addedDate: '01 Jun 2026',
  },
  {
    id: 'p-4',
    name: 'Manav Arora',
    email: 'manav.arora@gtbit.edu',
    phone: '+91 98333 44556',
    relation: 'Student',
    addedDate: '01 Sep 2026',
  },
  {
    id: 'p-5',
    name: 'Sana Kapoor',
    email: 'sana.kapoor@gtbit.edu',
    phone: '+91 98444 55667',
    relation: 'Student',
    addedDate: '15 Aug 2026',
  },
  {
    id: 'p-6',
    name: 'Ibrahim Sheikh',
    email: 'ibrahim.sheikh@gtbit.edu',
    phone: '+91 98555 66778',
    relation: 'Student',
    addedDate: '10 Jul 2026',
  },
];

const INITIAL_DUPLICATES: DuplicateRecord[] = [
  {
    id: 'dup-1',
    name: 'Arshdeep Singh',
    email: 'arshdeep@gtbit.edu',
    phone: '+91 98765 43210',
    matchReason: 'Same phone as record #2291',
    existingRecordId: 'p-1',
    status: 'flagged',
  },
];

const INITIAL_STUDENTS: StudentMembership[] = [
  {
    id: 'stu-1',
    studentNo: 'GTB24CS041',
    personId: 'p-1',
    name: 'Arshdeep Singh',
    email: 'arshdeep@gtbit.edu',
    department: 'Computer Science & Engg.',
    campus: 'Main',
    status: 'Active',
    history: [
      {
        id: 'hist-1',
        transition: 'Invited → Active',
        timestamp: '12 Sep 2026 · by Priya Nair',
        author: 'Priya Nair',
      },
      {
        id: 'hist-2',
        transition: 'Membership created — Invited',
        timestamp: '01 Sep 2026 · by system',
        author: 'system',
      },
    ],
  },
  {
    id: 'stu-2',
    studentNo: 'GTB24CS118',
    personId: 'p-4',
    name: 'Manav Arora',
    email: 'manav.arora@gtbit.edu',
    department: 'Computer Science & Engg.',
    campus: 'Main',
    status: 'Invited',
    history: [
      {
        id: 'hist-3',
        transition: 'Membership created — Invited',
        timestamp: '01 Sep 2026 · by system',
        author: 'system',
      },
    ],
  },
  {
    id: 'stu-3',
    studentNo: 'GTB23CS077',
    personId: 'p-5',
    name: 'Sana Kapoor',
    email: 'sana.kapoor@gtbit.edu',
    department: 'Computer Science & Engg.',
    campus: 'Main',
    status: 'Suspended',
    history: [
      {
        id: 'hist-4',
        transition: 'Active → Suspended',
        timestamp: '05 Sep 2026 · by Rekha Sinha',
        author: 'Rekha Sinha',
        reason: 'Administrative hold on enrolment documentation',
      },
      {
        id: 'hist-5',
        transition: 'Invited → Active',
        timestamp: '15 Aug 2026 · by Priya Nair',
        author: 'Priya Nair',
      },
      {
        id: 'hist-6',
        transition: 'Membership created — Invited',
        timestamp: '15 Aug 2026 · by system',
        author: 'system',
      },
    ],
  },
  {
    id: 'stu-4',
    studentNo: 'GTB21CS004',
    personId: 'p-6',
    name: 'Ibrahim Sheikh',
    email: 'ibrahim.sheikh@gtbit.edu',
    department: 'Computer Science & Engg.',
    campus: 'North',
    status: 'Withdrawn',
    history: [
      {
        id: 'hist-7',
        transition: 'Active → Withdrawn',
        timestamp: '20 Aug 2026 · by Priya Nair',
        author: 'Priya Nair',
        reason: 'Student transfer to partner university',
      },
      {
        id: 'hist-8',
        transition: 'Invited → Active',
        timestamp: '10 Jul 2026 · by Priya Nair',
        author: 'Priya Nair',
      },
      {
        id: 'hist-9',
        transition: 'Membership created — Invited',
        timestamp: '10 Jul 2026 · by system',
        author: 'system',
      },
    ],
  },
];

const INITIAL_AUDIT: AuditActivity[] = [
  {
    id: 'aud-1',
    action: 'Role assigned — Faculty',
    status: 'Success',
    timeAgo: '2 min ago',
    timestamp: '2026-09-27T01:01:00Z',
    actor: 'Priya Nair',
    resource: 'role:faculty -> rekha.sinha@gtbit.edu',
  },
  {
    id: 'aud-2',
    action: 'Student status → Active',
    status: 'Success',
    timeAgo: '18 min ago',
    timestamp: '2026-09-27T00:45:00Z',
    actor: 'Priya Nair',
    resource: 'student:GTB24CS041',
  },
  {
    id: 'aud-3',
    action: 'Cross-tenant read attempt',
    status: 'Blocked',
    timeAgo: '1 hr ago',
    timestamp: '2026-09-26T23:55:00Z',
    actor: 'system:security-policy',
    resource: 'tenant_isolation_boundary',
  },
  {
    id: 'aud-4',
    action: 'Department created — CSE',
    status: 'Success',
    timeAgo: 'Yesterday',
    timestamp: '2026-09-26T14:30:00Z',
    actor: 'Priya Nair',
    resource: 'dept:CSE',
  },
];

const INITIAL_SETUP: PendingSetupItem[] = [
  {
    id: 'set-1',
    title: 'Assign department admin — Mechanical',
    subtitle: 'Unassigned since setup',
    actionType: 'assign_admin',
  },
  {
    id: 'set-2',
    title: 'Review 4 duplicate person records',
    subtitle: 'Flagged by matcher',
    actionType: 'review_duplicate',
  },
  {
    id: 'set-3',
    title: 'Confirm campus 2 timezone',
    subtitle: 'Defaults applied',
    actionType: 'confirm_timezone',
  },
];

const INITIAL_USERS: UserRoleItem[] = [
  {
    id: 'u-1',
    name: 'Priya Nair',
    email: 'priya.nair@gtbit.edu',
    role: 'Institution admin',
    status: 'Active',
    assignedAt: '01 Jun 2026',
  },
  {
    id: 'u-2',
    name: 'Rekha Sinha',
    email: 'rekha.sinha@gtbit.edu',
    role: 'Faculty',
    department: 'Electronics & Comm.',
    status: 'Active',
    assignedAt: '03 Aug 2026',
  },
  {
    id: 'u-3',
    name: 'Amit Verma',
    email: 'amit.verma@gtbit.edu',
    role: 'Department admin',
    department: 'Information Technology',
    status: 'Active',
    assignedAt: '15 Aug 2026',
  },
  {
    id: 'u-4',
    name: 'Arshdeep Singh',
    email: 'arshdeep@gtbit.edu',
    role: 'Student',
    department: 'Computer Science & Engg.',
    status: 'Active',
    assignedAt: '12 Sep 2026',
  },
];

export interface AppState {
  institutions: Institution[];
  departments: Department[];
  people: Person[];
  duplicates: DuplicateRecord[];
  students: StudentMembership[];
  auditLogs: AuditActivity[];
  pendingSetups: PendingSetupItem[];
  userRoles: UserRoleItem[];
  selectedCampus: string;
  totalStudents: number;
}

class DataConnectorService {
  private state: AppState = {
    institutions: INITIAL_INSTITUTIONS,
    departments: INITIAL_DEPARTMENTS,
    people: INITIAL_PEOPLE,
    duplicates: INITIAL_DUPLICATES,
    students: INITIAL_STUDENTS,
    auditLogs: INITIAL_AUDIT,
    pendingSetups: INITIAL_SETUP,
    userRoles: INITIAL_USERS,
    selectedCampus: 'GTBIT Delhi · main campus',
    totalStudents: 1204,
  };

  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.load();
      // Also attempt background sync if API token is present
      this.trySyncBackend();
    }
  }

  private load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = {
          ...this.state,
          ...parsed,
        };
      }
    } catch {
      // fallback to initial
    }
  }

  private save() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // ignore
      }
      this.notify();
    }
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public getState(): AppState {
    return this.state;
  }

  public async trySyncBackend() {
    const session = loadSession();
    if (!session?.accessToken) return;

    try {
      // Attempt to load live institutions from API
      const liveInstitutions = await api<Array<{ id: string; name: string; code: string; status: string }>>(
        '/v1/institutions',
      ).catch(() => null);

      if (liveInstitutions && liveInstitutions.length > 0) {
        this.state.institutions = liveInstitutions.map((i, idx) => ({
          id: i.id,
          name: i.name,
          code: i.code,
          campusesCount: 3,
          departmentsCount: this.state.departments.length,
          status: (i.status === 'active' ? 'Active' : 'Inactive') as 'Active' | 'Inactive',
        }));
      }

      // Attempt to load live audit events
      const liveAudit = await api<Array<{
        id: string;
        action: string;
        created_at: string;
        actor_user_id?: string;
      }>>('/v1/audit-events?limit=10').catch(() => null);

      if (liveAudit && liveAudit.length > 0) {
        const mapped = liveAudit.map((a) => ({
          id: a.id,
          action: a.action,
          status: 'Success' as const,
          timeAgo: 'Recently',
          timestamp: a.created_at,
          actor: a.actor_user_id ?? 'System',
        }));
        this.state.auditLogs = [...mapped, ...this.state.auditLogs.slice(0, 5)];
      }

      this.save();
    } catch {
      // Backend not running or error - keep pristine robust local state
    }
  }

  // Actions
  public addInstitution(inst: { name: string; code: string; campusesCount?: number }) {
    const newInst: Institution = {
      id: `inst-${Date.now()}`,
      name: inst.name,
      code: inst.code,
      campusesCount: inst.campusesCount ?? 1,
      departmentsCount: 0,
      status: 'Active',
    };
    this.state.institutions.unshift(newInst);
    this.addAudit(`Institution created — ${inst.name}`, 'Success', 'Priya Nair');
    this.save();
    return newInst;
  }

  public updateInstitution(id: string, updates: Partial<Institution>) {
    this.state.institutions = this.state.institutions.map((inst) =>
      inst.id === id ? { ...inst, ...updates } : inst,
    );
    this.addAudit(`Institution updated — ${id}`, 'Success', 'Priya Nair');
    this.save();
  }

  public addDepartment(dept: { name: string; code: string; campus: string; admin?: string; studentsCount?: number }) {
    const newDept: Department = {
      id: `dept-${Date.now()}`,
      name: dept.name,
      code: dept.code,
      campus: dept.campus,
      admin: dept.admin || '—',
      studentsCount: dept.studentsCount ?? 0,
    };
    this.state.departments.push(newDept);
    // update institution department count
    if (this.state.institutions[0]) {
      this.state.institutions[0].departmentsCount = this.state.departments.length;
    }
    this.addAudit(`Department created — ${dept.code}`, 'Success', 'Priya Nair');
    this.save();
    return newDept;
  }

  public updateDepartment(id: string, updates: Partial<Department>) {
    this.state.departments = this.state.departments.map((d) =>
      d.id === id ? { ...d, ...updates } : d,
    );
    this.save();
  }

  public addPerson(person: {
    name: string;
    email: string;
    phone?: string;
    relation: Person['relation'];
  }) {
    const newPerson: Person = {
      id: `p-${Date.now()}`,
      name: person.name,
      email: person.email,
      phone: person.phone,
      relation: person.relation,
      addedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    };
    this.state.people.unshift(newPerson);
    this.addAudit(`Person registered — ${person.name}`, 'Success', 'Priya Nair');
    this.save();
    return newPerson;
  }

  public resolveDuplicate(id: string, resolution: 'merged' | 'dismissed' | 'reviewed') {
    this.state.duplicates = this.state.duplicates.map((dup) =>
      dup.id === id ? { ...dup, status: resolution } : dup,
    );
    this.addAudit(`Duplicate record resolved — ${resolution}`, 'Success', 'Priya Nair');
    this.save();
  }

  public convertPersonToStudent(data: {
    personId?: string;
    name: string;
    email: string;
    department: string;
    campus: string;
    studentNo?: string;
  }) {
    const studentNo = data.studentNo || `GTB24CS${String(Math.floor(100 + Math.random() * 900))}`;
    const newStudent: StudentMembership = {
      id: `stu-${Date.now()}`,
      studentNo,
      personId: data.personId || `p-${Date.now()}`,
      name: data.name,
      email: data.email,
      department: data.department || 'Computer Science & Engg.',
      campus: data.campus || 'Main',
      status: 'Active',
      history: [
        {
          id: `hist-${Date.now()}`,
          transition: 'Invited → Active',
          timestamp: `${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · by Priya Nair`,
          author: 'Priya Nair',
        },
        {
          id: `hist-${Date.now() - 1000}`,
          transition: 'Membership created — Invited',
          timestamp: `${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · by system`,
          author: 'system',
        },
      ],
    };

    // Ensure person exists in people table
    const existingPerson = this.state.people.find((p) => p.email === data.email || p.id === data.personId);
    if (!existingPerson) {
      this.state.people.unshift({
        id: newStudent.personId,
        name: data.name,
        email: data.email,
        relation: 'Student',
        addedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      });
    }

    this.state.students.unshift(newStudent);
    this.state.totalStudents += 1;
    this.addAudit(`Student status → Active (${studentNo})`, 'Success', 'Priya Nair');
    this.save();
    return newStudent;
  }

  public changeStudentStatus(studentId: string, newStatus: StudentMembership['status'], reason?: string) {
    this.state.students = this.state.students.map((s) => {
      if (s.id === studentId) {
        const oldStatus = s.status;
        const newHistoryItem: StatusHistoryItem = {
          id: `hist-${Date.now()}`,
          transition: `${oldStatus} → ${newStatus}`,
          timestamp: `${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · by Priya Nair`,
          author: 'Priya Nair',
          reason,
        };
        return {
          ...s,
          status: newStatus,
          history: [newHistoryItem, ...s.history],
        };
      }
      return s;
    });

    const student = this.state.students.find((s) => s.id === studentId);
    this.addAudit(`Student status → ${newStatus} (${student?.studentNo || studentId})`, 'Success', 'Priya Nair');
    this.save();
  }

  public addAudit(action: string, status: AuditActivity['status'], actor: string = 'Priya Nair') {
    const item: AuditActivity = {
      id: `aud-${Date.now()}`,
      action,
      status,
      timeAgo: 'Just now',
      timestamp: new Date().toISOString(),
      actor,
    };
    this.state.auditLogs = [item, ...this.state.auditLogs];
    this.save();
  }

  public completePendingSetup(id: string) {
    this.state.pendingSetups = this.state.pendingSetups.filter((s) => s.id !== id);
    this.addAudit(`Setup task resolved — ${id}`, 'Success', 'Priya Nair');
    this.save();
  }

  public assignUserRole(data: { name: string; email: string; role: string; department?: string }) {
    const newUser: UserRoleItem = {
      id: `u-${Date.now()}`,
      name: data.name,
      email: data.email,
      role: data.role,
      department: data.department,
      status: 'Active',
      assignedAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    };
    this.state.userRoles.unshift(newUser);
    this.addAudit(`Role assigned — ${data.role} (${data.name})`, 'Success', 'Priya Nair');
    this.save();
    return newUser;
  }

  public setSelectedCampus(campus: string) {
    this.state.selectedCampus = campus;
    this.save();
  }
}

export const dataConnector = new DataConnectorService();
