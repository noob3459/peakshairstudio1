"use client";

import { useCallback, useEffect, useState } from "react";

type AccessRole = "stylist" | "manager" | "dev";
type StylistRow = {
  id: string;
  name: string;
  role: string;
  accessRole: AccessRole;
  active: boolean;
  instagramHandle: string | null;
};

const ROLE_LABEL: Record<AccessRole, string> = {
  dev: "Developer",
  manager: "Owner",
  stylist: "Stylist",
};

export default function AdminUsersPage() {
  const [me, setMe] = useState<{ id: string; accessRole: AccessRole } | null>(null);
  const [users, setUsers] = useState<StylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultBanner, setResultBanner] = useState<{ name: string; password: string; note?: string } | null>(null);
  const [editing, setEditing] = useState<StylistRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "", active: true });
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ username: "", name: "", role: "Stylist" });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, usersRes] = await Promise.all([fetch("/api/admin/me"), fetch("/api/admin/stylists")]);
      if (meRes.ok) setMe(await meRes.json());
      if (!usersRes.ok) throw new Error("Failed to load");
      const data = await usersRes.json();
      setUsers(data.stylists);
    } catch {
      setError("Couldn't load users. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function resetPassword(user: StylistRow) {
    if (!confirm(`Reset ${user.name}'s password? Their current password will stop working immediately.`)) return;
    setBusyId(user.id);
    setResultBanner(null);
    try {
      const res = await fetch(`/api/admin/stylists/${user.id}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Couldn't reset that password.");
        return;
      }
      setResultBanner({ name: user.name, password: data.password });
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(user: StylistRow) {
    if (
      !confirm(
        `Remove ${user.name}'s account? They'll immediately lose access. If they have appointment history, they'll be deactivated instead of fully deleted to keep those records intact.`,
      )
    )
      return;
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/stylists/${user.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "Couldn't remove that account.");
        return;
      }
      if (data.deactivated) {
        alert(`${user.name} had appointment history, so their account was deactivated and access revoked, rather than fully deleted.`);
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function changeAccessRole(user: StylistRow, accessRole: AccessRole) {
    if (!confirm(`Set ${user.name}'s access level to "${ROLE_LABEL[accessRole]}"?`)) return;
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/stylists/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessRole }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Couldn't change that account's access level.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(user: StylistRow) {
    setEditing(user);
    setEditForm({ name: user.name, role: user.role, active: user.active });
  }

  async function saveEdit() {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const res = await fetch(`/api/admin/stylists/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name, role: editForm.role, active: editForm.active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Couldn't save changes.");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function submitAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/admin/stylists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "Couldn't create that account.");
        return;
      }
      setResultBanner({
        name: addForm.name,
        password: data.password,
        note: `Username: ${data.username}`,
      });
      setAddForm({ username: "", name: "", role: "Stylist" });
      setShowAddForm(false);
      await load();
    } finally {
      setAdding(false);
    }
  }

  const isDev = me?.accessRole === "dev";
  const canManage = me?.accessRole === "manager" || me?.accessRole === "dev";

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Staff</p>
          <h1 className="page-title">Users</h1>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setShowAddForm((s) => !s)}>
            {showAddForm ? "Cancel" : "Add User"}
          </button>
        )}
      </div>
      <p className="section-intro">
        {isDev
          ? "Everyone with admin access — add new staff, reset passwords, remove accounts, and set access levels."
          : "Stylists with admin access. Add new staff, reset a forgotten password, or remove someone who's left."}
      </p>

      <div aria-live="polite">
        {error && <p className="form-error">{error}</p>}
        {loading && <p>Loading&hellip;</p>}
      </div>

      {showAddForm && canManage && (
        <section className="admin-card">
          <div className="admin-card-head">
            <h2>Add a new staff account</h2>
          </div>
          <form onSubmit={submitAddUser}>
            <div className="admin-contact-form">
              <div className="form-field">
                <label htmlFor="add-username">Username (for sign-in)</label>
                <input
                  id="add-username"
                  type="text"
                  placeholder="e.g. jordan"
                  value={addForm.username}
                  onChange={(e) => setAddForm((p) => ({ ...p, username: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="add-name">Full name</label>
                <input
                  id="add-name"
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="add-role">Title</label>
                <input
                  id="add-role"
                  type="text"
                  value={addForm.role}
                  onChange={(e) => setAddForm((p) => ({ ...p, role: e.target.value }))}
                  required
                />
              </div>
            </div>
            <p className="booking-option-meta" style={{ marginBottom: "1rem" }}>
              New accounts start as Stylist access (their own availability only).
              {isDev && " You can change that below after creating them."}
            </p>
            <div aria-live="assertive">{addError && <p className="form-error">{addError}</p>}</div>
            <button type="submit" className="btn btn-primary" disabled={adding}>
              {adding ? "Creating…" : "Create Account"}
            </button>
          </form>
        </section>
      )}

      {resultBanner && (
        <div className="admin-banner admin-banner-success">
          <p>
            New password for <strong>{resultBanner.name}</strong>: <code>{resultBanner.password}</code>
          </p>
          {resultBanner.note && <p className="booking-option-meta">{resultBanner.note}</p>}
          <p className="booking-option-meta">
            Shown once — relay it securely (in person or a password manager&rsquo;s share feature), then dismiss this.
          </p>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setResultBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {!loading && users.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Title</th>
                <th scope="col">Access</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.role}</td>
                    <td>
                      {isDev && !isSelf ? (
                        <select
                          value={u.accessRole}
                          onChange={(e) => changeAccessRole(u, e.target.value as AccessRole)}
                          disabled={busyId === u.id}
                          aria-label={`Access level for ${u.name}`}
                          style={{ fontSize: "0.85rem", padding: "0.25em 0.5em" }}
                        >
                          <option value="stylist">Stylist</option>
                          <option value="manager">Owner</option>
                          <option value="dev">Developer</option>
                        </select>
                      ) : (
                        <span className={`admin-status-badge admin-role-${u.accessRole}`}>{ROLE_LABEL[u.accessRole]}</span>
                      )}
                      {!u.active && <span className="admin-status-badge admin-status-cancelled">inactive</span>}
                      {isSelf && <span className="booking-option-meta"> (you)</span>}
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => resetPassword(u)}
                          disabled={busyId === u.id}
                        >
                          Reset Password
                        </button>
                        {isDev && (
                          <button type="button" className="btn btn-secondary" onClick={() => startEdit(u)}>
                            Edit
                          </button>
                        )}
                        {canManage && !isSelf && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => removeUser(u)}
                            disabled={busyId === u.id}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="admin-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem" }}>Edit {editing.name}</h2>
            <div className="form-field">
              <label htmlFor="edit-name">Name</label>
              <input
                id="edit-name"
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-role">Title</label>
              <input
                id="edit-role"
                type="text"
                value={editForm.role}
                onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
              />
            </div>
            <label className="booking-checkbox">
              <input
                type="checkbox"
                checked={editForm.active}
                onChange={(e) => setEditForm((p) => ({ ...p, active: e.target.checked }))}
              />
              Active (shown publicly and bookable)
            </label>
            <div className="admin-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={busyId === editing.id}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
