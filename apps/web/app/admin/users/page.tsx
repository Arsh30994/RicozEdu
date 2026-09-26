'use client';

import { useEffect, useState } from 'react';
import {
  dataConnector,
  UserRoleItem,
  AppState,
} from '../../../lib/data-connector';

export default function UsersRolesPage() {
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Assign Role Form state
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('Faculty');
  const [userDept, setUserDept] = useState('Computer Science & Engg.');

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => {
      setState({ ...dataConnector.getState() });
    });
    return () => unsub();
  }, []);

  function handleAssignRole(e: React.FormEvent) {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) return;

    dataConnector.assignUserRole({
      name: userName.trim(),
      email: userEmail.trim(),
      role: userRole,
      department: userDept,
    });

    setUserName('');
    setUserEmail('');
    setShowAssignModal(false);
  }

  return (
    <section>
      {/* Top Header */}
      <div className="view-header">
        <h1>Users & roles</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowAssignModal(true)}
        >
          + Assign role
        </button>
      </div>

      {/* User Memberships Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">User Memberships & Permissions</h2>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Name</th>
                <th style={{ width: '30%' }}>Email</th>
                <th style={{ width: '25%' }}>Assigned Role</th>
                <th style={{ width: '20%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.userRoles.map((u) => (
                <tr key={u.id}>
                  <td style={{ color: '#ffffff', fontWeight: 500 }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span style={{ color: 'var(--ink-primary)' }}>{u.role}</span>
                    {u.department && (
                      <span style={{ color: 'var(--ink-secondary)', fontSize: '0.82rem', display: 'block' }}>
                        {u.department}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="pill-badge active">{u.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Definitions Matrix */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Defined Role Scopes</h2>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Role</th>
                <th style={{ width: '45%' }}>Permissions</th>
                <th style={{ width: '30%' }}>Scope Level</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ color: '#ffffff', fontWeight: 500 }}>Institution Admin</td>
                <td style={{ color: 'var(--ink-secondary)' }}>
                  tenant.read, tenant.manage, institution.manage, membership.manage, student.manage, audit.read
                </td>
                <td>Tenant / Institution</td>
              </tr>
              <tr>
                <td style={{ color: '#ffffff', fontWeight: 500 }}>Faculty / Teacher</td>
                <td style={{ color: 'var(--ink-secondary)' }}>
                  academic.read, academic.manage, grade.manage, student.read
                </td>
                <td>Department / Course</td>
              </tr>
              <tr>
                <td style={{ color: '#ffffff', fontWeight: 500 }}>Department Admin</td>
                <td style={{ color: 'var(--ink-secondary)' }}>
                  academic.manage, student.read, student.manage, grade.manage
                </td>
                <td>Department</td>
              </tr>
              <tr>
                <td style={{ color: '#ffffff', fontWeight: 500 }}>Student</td>
                <td style={{ color: 'var(--ink-secondary)' }}>
                  student.read (self), academic.read
                </td>
                <td>Self</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Assign Role */}
      {showAssignModal && (
        <div className="modal-backdrop" onClick={() => setShowAssignModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Assign role & permissions</h2>
            <p>Grant administrative or academic capabilities to an institution user.</p>

            <form onSubmit={handleAssignRole}>
              <div className="form-group">
                <label htmlFor="user-name">Full Name</label>
                <input
                  id="user-name"
                  required
                  placeholder="e.g. Rekha Sinha"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="user-email">Email Address</label>
                <input
                  id="user-email"
                  type="email"
                  required
                  placeholder="e.g. rekha.sinha@gtbit.edu"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="user-role">Role</label>
                <select
                  id="user-role"
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                >
                  <option value="Institution admin">Institution admin</option>
                  <option value="Faculty">Faculty</option>
                  <option value="Department admin">Department admin</option>
                  <option value="Examination officer">Examination officer</option>
                  <option value="Student">Student</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="user-dept">Department Scope</label>
                <select
                  id="user-dept"
                  value={userDept}
                  onChange={(e) => setUserDept(e.target.value)}
                >
                  {state.departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAssignModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Assign Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
