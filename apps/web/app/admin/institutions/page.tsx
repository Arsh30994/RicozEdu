'use client';

import { useEffect, useState } from 'react';
import {
  dataConnector,
  Institution,
  Department,
  AppState,
} from '../../../lib/data-connector';

export default function InstitutionsPage() {
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [showNewInstModal, setShowNewInstModal] = useState(false);
  const [showEditInstModal, setShowEditInstModal] = useState<Institution | null>(null);
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // New Institution Form state
  const [instName, setInstName] = useState('');
  const [instCode, setInstCode] = useState('');
  const [instCampuses, setInstCampuses] = useState(3);

  // New Department Form state
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptCampus, setDeptCampus] = useState('Main');
  const [deptAdmin, setDeptAdmin] = useState('');
  const [deptStudents, setDeptStudents] = useState<number>(0);

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => {
      setState({ ...dataConnector.getState() });
    });
    return () => unsub();
  }, []);

  function handleCreateInstitution(e: React.FormEvent) {
    e.preventDefault();
    if (!instName.trim()) return;
    dataConnector.addInstitution({
      name: instName.trim(),
      code: instCode.trim().toUpperCase() || 'INST',
      campusesCount: Number(instCampuses) || 1,
    });
    setInstName('');
    setInstCode('');
    setShowNewInstModal(false);
  }

  function handleSaveEditInstitution(e: React.FormEvent) {
    e.preventDefault();
    if (!showEditInstModal) return;
    dataConnector.updateInstitution(showEditInstModal.id, {
      name: showEditInstModal.name,
      campusesCount: showEditInstModal.campusesCount,
      status: showEditInstModal.status,
    });
    setShowEditInstModal(null);
  }

  function handleCreateDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!deptName.trim()) return;
    dataConnector.addDepartment({
      name: deptName.trim(),
      code: deptCode.trim().toUpperCase() || 'DEPT',
      campus: deptCampus,
      admin: deptAdmin.trim() || '—',
      studentsCount: Number(deptStudents) || 0,
    });
    setDeptName('');
    setDeptCode('');
    setDeptAdmin('');
    setDeptStudents(0);
    setShowAddDeptModal(false);
  }

  function handleSaveEditDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDept) return;
    dataConnector.updateDepartment(editingDept.id, {
      admin: editingDept.admin,
      campus: editingDept.campus,
      studentsCount: editingDept.studentsCount,
    });
    if (editingDept.code === 'ME' && editingDept.admin && editingDept.admin !== 'Unassigned') {
      dataConnector.completePendingSetup('set-1');
    }
    setEditingDept(null);
  }

  const primaryInstitution = state.institutions[0] ?? {
    name: 'GTBIT Delhi',
    campusesCount: 3,
    departmentsCount: state.departments.length,
    status: 'Active',
  };

  return (
    <section>
      {/* Top Header */}
      <div className="view-header">
        <h1>Institutions & structure</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowNewInstModal(true)}
        >
          + New institution
        </button>
      </div>

      {/* Institutions Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Institutions</h2>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Name</th>
                <th style={{ width: '20%' }}>Campuses</th>
                <th style={{ width: '20%' }}>Departments</th>
                <th style={{ width: '18%' }}>Status</th>
                <th style={{ width: '12%', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {state.institutions.map((inst) => (
                <tr key={inst.id}>
                  <td style={{ fontWeight: 500, color: '#ffffff' }}>{inst.name}</td>
                  <td>{inst.campusesCount}</td>
                  <td>{state.departments.length}</td>
                  <td>
                    <span className="pill-badge active">{inst.status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowEditInstModal({ ...inst })}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Departments Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Departments — {primaryInstitution.name}</h2>
          <button
            type="button"
            className="btn-secondary"
            style={{ color: 'var(--ink-primary)', borderColor: 'var(--border-subtle)' }}
            onClick={() => setShowAddDeptModal(true)}
          >
            + Add department
          </button>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '36%' }}>Department</th>
                <th style={{ width: '18%' }}>Campus</th>
                <th style={{ width: '28%' }}>Admin</th>
                <th style={{ width: '18%' }}>Students</th>
              </tr>
            </thead>
            <tbody>
              {state.departments.map((dept) => (
                <tr key={dept.id}>
                  <td style={{ color: '#ffffff', fontWeight: 400 }}>{dept.name}</td>
                  <td>{dept.campus}</td>
                  <td>
                    {dept.admin === 'Unassigned' ? (
                      <span
                        style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--ink-secondary)' }}
                        onClick={() => setEditingDept({ ...dept })}
                        title="Click to assign admin"
                      >
                        Unassigned
                      </span>
                    ) : (
                      dept.admin
                    )}
                  </td>
                  <td>{dept.studentsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Institution */}
      {showNewInstModal && (
        <div className="modal-backdrop" onClick={() => setShowNewInstModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>New institution</h2>
            <p>Define an institutional entity within the multi-tenant partition.</p>

            <form onSubmit={handleCreateInstitution}>
              <div className="form-group">
                <label htmlFor="inst-name">Institution Name</label>
                <input
                  id="inst-name"
                  required
                  placeholder="e.g. GTBIT Delhi"
                  value={instName}
                  onChange={(e) => setInstName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="inst-code">Code</label>
                <input
                  id="inst-code"
                  placeholder="e.g. GTBIT"
                  value={instCode}
                  onChange={(e) => setInstCode(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="inst-camp">Initial Campuses Count</label>
                <input
                  id="inst-camp"
                  type="number"
                  min="1"
                  value={instCampuses}
                  onChange={(e) => setInstCampuses(Number(e.target.value))}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowNewInstModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Institution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Institution */}
      {showEditInstModal && (
        <div className="modal-backdrop" onClick={() => setShowEditInstModal(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Edit institution</h2>
            <p>Update configuration for {showEditInstModal.name}.</p>

            <form onSubmit={handleSaveEditInstitution}>
              <div className="form-group">
                <label htmlFor="edit-inst-name">Name</label>
                <input
                  id="edit-inst-name"
                  required
                  value={showEditInstModal.name}
                  onChange={(e) =>
                    setShowEditInstModal({ ...showEditInstModal, name: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-inst-camp">Campuses Count</label>
                <input
                  id="edit-inst-camp"
                  type="number"
                  min="1"
                  value={showEditInstModal.campusesCount}
                  onChange={(e) =>
                    setShowEditInstModal({
                      ...showEditInstModal,
                      campusesCount: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-inst-stat">Status</label>
                <select
                  id="edit-inst-stat"
                  value={showEditInstModal.status}
                  onChange={(e) =>
                    setShowEditInstModal({
                      ...showEditInstModal,
                      status: e.target.value as 'Active' | 'Inactive' | 'Archived',
                    })
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEditInstModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Department */}
      {showAddDeptModal && (
        <div className="modal-backdrop" onClick={() => setShowAddDeptModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Add department</h2>
            <p>Add a new academic department under {primaryInstitution.name}.</p>

            <form onSubmit={handleCreateDepartment}>
              <div className="form-group">
                <label htmlFor="dept-name">Department Name</label>
                <input
                  id="dept-name"
                  required
                  placeholder="e.g. Computer Science & Engg."
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="dept-code">Department Code</label>
                <input
                  id="dept-code"
                  placeholder="e.g. CSE"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="dept-campus">Campus</label>
                <select
                  id="dept-campus"
                  value={deptCampus}
                  onChange={(e) => setDeptCampus(e.target.value)}
                >
                  <option value="Main">Main</option>
                  <option value="North">North</option>
                  <option value="South">South</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="dept-admin">Assigned Admin</label>
                <input
                  id="dept-admin"
                  placeholder="e.g. Rekha Sinha or —"
                  value={deptAdmin}
                  onChange={(e) => setDeptAdmin(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="dept-students">Enrolled Students Count</label>
                <input
                  id="dept-students"
                  type="number"
                  min="0"
                  value={deptStudents}
                  onChange={(e) => setDeptStudents(Number(e.target.value))}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddDeptModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Department Admin */}
      {editingDept && (
        <div className="modal-backdrop" onClick={() => setEditingDept(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Configure Department — {editingDept.name}</h2>
            <p>Update administrator assignment and operational details.</p>

            <form onSubmit={handleSaveEditDepartment}>
              <div className="form-group">
                <label htmlFor="edit-dept-admin">Department Admin</label>
                <input
                  id="edit-dept-admin"
                  placeholder="e.g. Dr. Rajesh Kumar"
                  value={editingDept.admin}
                  onChange={(e) =>
                    setEditingDept({ ...editingDept, admin: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-dept-campus">Campus</label>
                <select
                  id="edit-dept-campus"
                  value={editingDept.campus}
                  onChange={(e) =>
                    setEditingDept({ ...editingDept, campus: e.target.value })
                  }
                >
                  <option value="Main">Main</option>
                  <option value="North">North</option>
                  <option value="South">South</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="edit-dept-students">Student Count</label>
                <input
                  id="edit-dept-students"
                  type="number"
                  value={editingDept.studentsCount}
                  onChange={(e) =>
                    setEditingDept({
                      ...editingDept,
                      studentsCount: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingDept(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Update Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
