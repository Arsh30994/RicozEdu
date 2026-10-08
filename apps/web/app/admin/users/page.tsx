'use client';

import { useEffect, useState } from 'react';
import { PageHeader, StatusPill, displayRole } from '../../../components/console-ui';
import {
  dataConnector,
  UserRoleItem,
  AppState,
} from '../../../lib/data-connector';

export default function UsersRolesPage() {
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

    const payload = {
      name: userName.trim(),
      email: userEmail.trim(),
      role: userRole,
      department: userDept,
    };
    if (editingId) dataConnector.updateUserRole(editingId, payload);
    else dataConnector.assignUserRole(payload);

    setUserName('');
    setUserEmail('');
    setEditingId(null);
    setShowAssignModal(false);
  }

  function openInvite() {
    setEditingId(null);
    setUserName('');
    setUserEmail('');
    setUserRole('Faculty');
    setUserDept('Computer Science & Engg.');
    setShowAssignModal(true);
  }

  function openManage(user: UserRoleItem) {
    setEditingId(user.id);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserRole(user.role);
    setUserDept(user.department || 'Computer Science & Engg.');
    setShowAssignModal(true);
  }

  return (
    <section>
      {/* Top Header */}
      <PageHeader title="Users & roles">
        <button type="button" className="btn-primary" onClick={openInvite}>
          + Invite user
        </button>
      </PageHeader>

      <div className="card">
        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>User</th>
                <th style={{ width: '24%' }}>Role</th>
                <th style={{ width: '24%' }}>Scope</th>
                <th style={{ width: '14%' }}>Status</th>
                <th style={{ width: '16%' }}></th>
              </tr>
            </thead>
            <tbody>
              {state.userRoles.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.name}</td>
                  <td>{displayRole(u.role)}</td>
                  <td>{u.scope || u.department || 'GTBIT Delhi'}</td>
                  <td>
                    <StatusPill value={u.status === 'Disabled' ? 'Inactive' : u.status} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {u.status === 'Active' ? (
                      <button type="button" className="btn-secondary" onClick={() => openManage(u)}>
                        Manage
                      </button>
                    ) : (
                      <span style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>No actions available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Assign Role */}
      {showAssignModal && (
        <div className="modal-backdrop" onClick={() => setShowAssignModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Manage user' : 'Invite user'}</h2>
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
                  <option value="institution administrator">institution administrator</option>
                  <option value="Department administrator">Department administrator</option>
                  <option value="Faculty">Faculty</option>
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
                  onClick={() => {
                    setEditingId(null);
                    setShowAssignModal(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Save' : 'Invite user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
