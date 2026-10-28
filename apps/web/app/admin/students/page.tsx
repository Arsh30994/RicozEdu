'use client';

import { useEffect, useState } from 'react';
import { PageHeader, StatusPill } from '../../../components/console-ui';
import { dataConnector, AppState } from '../../../lib/data-connector';
import { matchesQuery } from '../../../lib/search';
import { api, createIdempotencyKey, loadSession } from '../../../lib/api';

type ApiStudent = {
  id: string;
  studentNo: string;
  name: string;
  email: string;
  department: string;
  campus: string;
  status: 'prospective' | 'active' | 'inactive' | 'graduated' | 'withdrawn' | 'suspended';
  history: Array<{ status: ApiStudent['status']; reason: string; actorUserId: string; changedAt: string }>;
};

function toStudentMembership(student: ApiStudent): AppState['students'][number] {
  const statusLabels: Record<ApiStudent['status'], AppState['students'][number]['status']> = {
    prospective: 'Prospective',
    active: 'Active',
    inactive: 'Inactive',
    graduated: 'Graduated',
    withdrawn: 'Withdrawn',
    suspended: 'Suspended',
  };
  const statusLabel = statusLabels[student.status];
  return {
    id: student.id,
    studentNo: student.studentNo,
    personId: '',
    name: student.name,
    email: student.email,
    department: student.department,
    campus: student.campus,
    status: statusLabel,
    history: student.history.map((item, index) => ({
      id: `${student.id}-history-${index}`,
      transition: `Status changed to ${item.status}`,
      timestamp: `${new Date(item.changedAt).toLocaleDateString('en-GB')} · by staff`,
      author: 'Staff',
      reason: item.reason || undefined,
    })),
  };
}

export default function StudentsPage() {
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [liveMode, setLiveMode] = useState(false);
  const [liveStudents, setLiveStudents] = useState<AppState['students']>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('stu-1');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [pageQuery, setPageQuery] = useState('');

  // Convert Form state
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentDept, setStudentDept] = useState('Computer Science & Engg.');
  const [studentCampus, setStudentCampus] = useState('Main');
  const [studentNoInput, setStudentNoInput] = useState('');

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => {
      setState({ ...dataConnector.getState() });
    });
    setPageQuery(new URLSearchParams(window.location.search).get('q') ?? '');
    const session = loadSession();
    if (session?.accessToken && session.tenantId) {
      setLiveMode(true);
      const controller = new AbortController();
      void api<{ items: ApiStudent[] }>('/v1/students?page=1&limit=100', { session, signal: controller.signal })
        .then((result) => {
          setLiveStudents(result.items.map(toStudentMembership));
          setApiError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setLiveStudents([]);
          setApiError(error instanceof Error ? error.message : 'Unable to load student memberships.');
        });
      return () => {
        controller.abort();
        unsub();
      };
    }
    return () => unsub();
  }, []);

  const students = liveMode ? liveStudents : state.students;
  const visibleStudents = students.filter((student) =>
    matchesQuery(pageQuery, student.name, student.email, student.studentNo, student.status, student.campus, student.department),
  );
  const selectedStudent =
    visibleStudents.find((s) => s.id === selectedStudentId) || visibleStudents[0];
  const listedDepartments = [...new Set(students.map((student) => student.department).filter(Boolean))];
  const listDepartment = listedDepartments.length === 1 ? listedDepartments[0] : state.departments[0]?.name;

  async function handleConvertSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentName.trim() || !studentEmail.trim()) return;

    if (liveMode) {
      const session = loadSession();
      if (!session) {
        setApiError('Your session has expired. Sign in again to enroll a student.');
        return;
      }
      setSaving(true);
      setApiError(null);
      try {
        const student = await api<ApiStudent>('/v1/students', {
          method: 'POST',
          session,
          body: JSON.stringify({
            studentNo: studentNoInput.trim() || `STU-${createIdempotencyKey().slice(0, 8).toUpperCase()}`,
            fullName: studentName.trim(),
            email: studentEmail.trim(),
            department: studentDept,
            campus: studentCampus,
            status: 'active',
          }),
        });
        const mappedStudent = toStudentMembership(student);
        setLiveStudents((current) => [mappedStudent, ...current]);
        setSelectedStudentId(mappedStudent.id);
        setShowConvertModal(false);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : 'Unable to enroll this student.');
        return;
      } finally {
        setSaving(false);
      }
    } else {
      dataConnector.convertPersonToStudent({
        personId: selectedPersonId || undefined,
        name: studentName.trim(),
        email: studentEmail.trim(),
        department: studentDept,
        campus: studentCampus,
        studentNo: studentNoInput.trim() || undefined,
      });
    }

    setStudentName('');
    setStudentEmail('');
    setSelectedPersonId('');
    setStudentNoInput('');
    setShowConvertModal(false);
  }

  function handlePersonSelect(personId: string) {
    setSelectedPersonId(personId);
    const person = state.people.find((p) => p.id === personId);
    if (person) {
      setStudentName(person.name);
      setStudentEmail(person.email);
    }
  }

  return (
    <section>
      {/* Top Header */}
      <PageHeader title="Student memberships">
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowConvertModal(true)}
        >
          + Convert person to student
        </button>
      </PageHeader>
      {apiError ? <p className="error" role="alert">{apiError}</p> : null}

      {/* Students Table Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Students — {listDepartment || 'Students'}</h2>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Student no.</th>
                <th style={{ width: '32%' }}>Name</th>
                <th style={{ width: '25%' }}>Status</th>
                <th style={{ width: '18%' }}>Campus</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((student) => {
                const isSelected = student.id === selectedStudent?.id;
                return (
                  <tr
                    key={student.id}
                    className={isSelected ? 'selected' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedStudentId(student.id)}
                  >
                    <td style={{ color: 'var(--ink-primary)', fontWeight: 500 }}>{student.studentNo}</td>
                    <td>{student.name}</td>
                    <td>
                      <StatusPill value={student.status} />
                    </td>
                    <td>{student.campus}</td>
                  </tr>
                );
              })}
              {visibleStudents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-secondary)', padding: '1.5rem' }}>
                    {liveMode && !apiError ? 'Loading student records…' : `No students match “${pageQuery}”.`}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status History Card */}
      {selectedStudent && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              Status history — {selectedStudent.name} ({selectedStudent.studentNo})
            </h2>
          </div>

          <div className="timeline-list history">
            {selectedStudent.history.map((item) => (
              <div key={item.id} className="timeline-item">
                <div className="bullet-dot" />
                <div className="timeline-content">
                  <div className="timeline-title">{item.transition}</div>
                  <div className="timeline-subtitle">{item.timestamp}</div>
                  {item.reason && (
                    <div style={{ fontSize: '0.8rem', color: '#e0a59f', marginTop: '0.2rem' }}>
                      Reason: {item.reason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Convert Person to Student */}
      {showConvertModal && (
        <div className="modal-backdrop" onClick={() => setShowConvertModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Convert person to student</h2>
            <p>Enroll a verified person into an academic programme membership.</p>

            <form onSubmit={handleConvertSubmit}>
              <div className="form-group">
                <label htmlFor="select-person">Select from existing people</label>
                <select
                  id="select-person"
                  value={selectedPersonId}
                  onChange={(e) => handlePersonSelect(e.target.value)}
                >
                  <option value="">-- Choose existing or type below --</option>
                  {state.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.email}) - {p.relation}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="stu-name">Full Name</label>
                <input
                  id="stu-name"
                  required
                  placeholder="e.g. Arshdeep Singh"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="stu-email">Institutional Email</label>
                <input
                  id="stu-email"
                  type="email"
                  required
                  placeholder="e.g. arshdeep@gtbit.edu"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="stu-dept">Department</label>
                <select
                  id="stu-dept"
                  value={studentDept}
                  onChange={(e) => setStudentDept(e.target.value)}
                >
                  {state.departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="stu-campus">Campus</label>
                <select
                  id="stu-campus"
                  value={studentCampus}
                  onChange={(e) => setStudentCampus(e.target.value)}
                >
                  <option value="Main">Main</option>
                  <option value="North">North</option>
                  <option value="South">South</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="stu-no">Custom Student Number (Optional)</label>
                <input
                  id="stu-no"
                  placeholder="Leave blank for auto-generation"
                  value={studentNoInput}
                  onChange={(e) => setStudentNoInput(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowConvertModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Enrolling…' : 'Enroll Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </section>
  );
}
