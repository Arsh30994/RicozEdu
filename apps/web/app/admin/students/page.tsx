'use client';

import { useEffect, useState } from 'react';
import {
  dataConnector,
  StudentMembership,
  AppState,
} from '../../../lib/data-connector';

export default function StudentsPage() {
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [selectedStudentId, setSelectedStudentId] = useState<string>('stu-1');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // Convert Form state
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentDept, setStudentDept] = useState('Computer Science & Engg.');
  const [studentCampus, setStudentCampus] = useState('Main');
  const [studentNoInput, setStudentNoInput] = useState('');

  // Status Change state
  const [newStatus, setNewStatus] = useState<StudentMembership['status']>('Active');
  const [statusReason, setStatusReason] = useState('');

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => {
      setState({ ...dataConnector.getState() });
    });
    return () => unsub();
  }, []);

  const selectedStudent =
    state.students.find((s) => s.id === selectedStudentId) || state.students[0];

  function handleConvertSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentName.trim() || !studentEmail.trim()) return;

    dataConnector.convertPersonToStudent({
      personId: selectedPersonId || undefined,
      name: studentName.trim(),
      email: studentEmail.trim(),
      department: studentDept,
      campus: studentCampus,
      studentNo: studentNoInput.trim() || undefined,
    });

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

  function handleStatusSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent) return;
    dataConnector.changeStudentStatus(selectedStudent.id, newStatus, statusReason);
    setStatusReason('');
    setShowStatusModal(false);
  }

  return (
    <section>
      {/* Top Header */}
      <div className="view-header">
        <h1>Student memberships</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowConvertModal(true)}
        >
          + Convert person to student
        </button>
      </div>

      {/* Students Table Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Students — Computer Science & Engg.</h2>
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
              {state.students.map((student) => {
                const isSelected = student.id === selectedStudent?.id;
                let badgeClass = 'active';
                if (student.status === 'Invited') badgeClass = 'invited';
                else if (student.status === 'Suspended') badgeClass = 'suspended';
                else if (student.status === 'Withdrawn') badgeClass = 'neutral';

                return (
                  <tr
                    key={student.id}
                    className={isSelected ? 'selected' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedStudentId(student.id)}
                  >
                    <td style={{ color: '#ffffff', fontWeight: 500 }}>{student.studentNo}</td>
                    <td>{student.name}</td>
                    <td>
                      {student.status === 'Withdrawn' ? (
                        <span style={{ color: 'var(--ink-secondary)', fontSize: '0.92rem' }}>
                          Withdrawn
                        </span>
                      ) : (
                        <span className={`pill-badge ${badgeClass}`}>{student.status}</span>
                      )}
                    </td>
                    <td>{student.campus}</td>
                  </tr>
                );
              })}
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
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setNewStatus(selectedStudent.status);
                setShowStatusModal(true);
              }}
            >
              Update Status
            </button>
          </div>

          <div className="timeline-list">
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
                <button type="submit" className="btn-primary">
                  Enroll Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Update Student Status */}
      {showStatusModal && selectedStudent && (
        <div className="modal-backdrop" onClick={() => setShowStatusModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Update Status — {selectedStudent.name}</h2>
            <p>Modify lifecycle state for student {selectedStudent.studentNo}.</p>

            <form onSubmit={handleStatusSubmit}>
              <div className="form-group">
                <label htmlFor="new-stat">Target Status</label>
                <select
                  id="new-stat"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as StudentMembership['status'])}
                >
                  <option value="Active">Active</option>
                  <option value="Invited">Invited</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Withdrawn">Withdrawn</option>
                  <option value="Graduated">Graduated</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="status-reason">Reason / Note (Optional)</label>
                <textarea
                  id="status-reason"
                  rows={3}
                  placeholder="Provide context for audit records..."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowStatusModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Apply Status Change
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
