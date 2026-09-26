'use client';

import { useEffect, useState } from 'react';
import {
  dataConnector,
  Person,
  DuplicateRecord,
  AppState,
} from '../../../lib/data-connector';

export default function PeoplePage() {
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [reviewingDuplicate, setReviewingDuplicate] = useState<DuplicateRecord | null>(null);

  // New Person Form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelation, setNewRelation] = useState<Person['relation']>('Student');

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => {
      setState({ ...dataConnector.getState() });
    });
    return () => unsub();
  }, []);

  function handleCreatePerson(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    dataConnector.addPerson({
      name: newName.trim(),
      email: newEmail.trim(),
      phone: newPhone.trim(),
      relation: newRelation,
    });
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setShowAddPersonModal(false);
  }

  function handleResolveDuplicate(resolution: 'merged' | 'dismissed') {
    if (!reviewingDuplicate) return;
    dataConnector.resolveDuplicate(reviewingDuplicate.id, resolution);
    dataConnector.completePendingSetup('set-2');
    setReviewingDuplicate(null);
  }

  const query = searchQuery.trim().toLowerCase();

  const flaggedDuplicates = state.duplicates.filter(
    (d) =>
      d.status === 'flagged' &&
      (d.name.toLowerCase().includes(query) ||
        d.email.toLowerCase().includes(query) ||
        (d.phone && d.phone.toLowerCase().includes(query))),
  );

  const filteredPeople = state.people.filter(
    (p) =>
      p.name.toLowerCase().includes(query) ||
      p.email.toLowerCase().includes(query) ||
      (p.phone && p.phone.toLowerCase().includes(query)) ||
      p.relation.toLowerCase().includes(query),
  );

  return (
    <section>
      {/* Top Header */}
      <div className="view-header">
        <h1>People</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowAddPersonModal(true)}
        >
          + Add person
        </button>
      </div>

      {/* Search Bar */}
      <div className="search-container">
        <input
          type="text"
          className="search-input-box"
          placeholder="Search by name, email, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button type="button" className="btn-secondary" style={{ padding: '0.65rem 1.15rem' }}>
          Search
        </button>
      </div>

      {/* Possible Duplicate Card */}
      {flaggedDuplicates.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Possible duplicate</h2>
            <span className="pill-badge flagged">
              {flaggedDuplicates.length} flagged
            </span>
          </div>

          <div className="table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Name</th>
                  <th style={{ width: '30%' }}>Email</th>
                  <th style={{ width: '28%' }}>Match reason</th>
                  <th style={{ width: '14%', textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {flaggedDuplicates.map((dup) => (
                  <tr key={dup.id}>
                    <td style={{ color: '#ffffff', fontWeight: 400 }}>{dup.name}</td>
                    <td>{dup.email}</td>
                    <td style={{ color: 'var(--ink-secondary)' }}>{dup.matchReason}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setReviewingDuplicate(dup)}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All People Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">All people</h2>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Name</th>
                <th style={{ width: '32%' }}>Email</th>
                <th style={{ width: '22%' }}>Relation</th>
                <th style={{ width: '18%' }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map((person) => (
                <tr key={person.id}>
                  <td style={{ color: '#ffffff', fontWeight: 400 }}>{person.name}</td>
                  <td>{person.email}</td>
                  <td>{person.relation}</td>
                  <td style={{ color: 'var(--ink-secondary)' }}>{person.addedDate}</td>
                </tr>
              ))}
              {filteredPeople.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-secondary)', padding: '2rem' }}>
                    No matching records found for "{searchQuery}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Person */}
      {showAddPersonModal && (
        <div className="modal-backdrop" onClick={() => setShowAddPersonModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Add person</h2>
            <p>Create a master identity profile in the multi-tenant directory.</p>

            <form onSubmit={handleCreatePerson}>
              <div className="form-group">
                <label htmlFor="person-name">Full Name</label>
                <input
                  id="person-name"
                  required
                  placeholder="e.g. Arshdeep Singh"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="person-email">Primary Email</label>
                <input
                  id="person-email"
                  type="email"
                  required
                  placeholder="e.g. arshdeep@gtbit.edu"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="person-phone">Phone (Optional)</label>
                <input
                  id="person-phone"
                  placeholder="e.g. +91 98765 43210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="person-relation">Primary Role / Relation</label>
                <select
                  id="person-relation"
                  value={newRelation}
                  onChange={(e) => setNewRelation(e.target.value as Person['relation'])}
                >
                  <option value="Student">Student</option>
                  <option value="Faculty">Faculty</option>
                  <option value="Institution admin">Institution admin</option>
                  <option value="Department admin">Department admin</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddPersonModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Person
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Review Duplicate */}
      {reviewingDuplicate && (
        <div className="modal-backdrop" onClick={() => setReviewingDuplicate(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Review duplicate record</h2>
            <p>
              Potential duplicate match detected for <strong>{reviewingDuplicate.name}</strong> ({reviewingDuplicate.email}).
            </p>

            <div
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.25rem',
                fontSize: '0.9rem',
              }}
            >
              <div style={{ marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--ink-secondary)' }}>Reason: </span>
                <span style={{ color: '#ffffff' }}>{reviewingDuplicate.matchReason}</span>
              </div>
              <div>
                <span style={{ color: 'var(--ink-secondary)' }}>Target Record ID: </span>
                <span style={{ color: 'var(--ink-primary)' }}>{reviewingDuplicate.existingRecordId}</span>
              </div>
            </div>

            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setReviewingDuplicate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ borderColor: 'var(--border-focus)' }}
                onClick={() => handleResolveDuplicate('dismissed')}
              >
                Keep Separate
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleResolveDuplicate('merged')}
              >
                Merge Records
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
