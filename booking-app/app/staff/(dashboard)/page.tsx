"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatLocalDate, formatLocalTime, zonedDateMinutesToUtc, todayLocalDateStr } from "@/lib/timezone";
import NewAppointmentForm from "./NewAppointmentForm";

type AppointmentRow = {
  id: string;
  confirmationCode: string;
  startAt: string;
  endAt: string;
  status: "pending" | "confirmed" | "cancelled";
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  notes: string | null;
  serviceName: string;
  stylistName: string;
};

type RangeKey = "upcoming" | "today" | "all" | "past";

export default function AdminAppointmentsPage() {
  const [me, setMe] = useState<{ accessRole: string } | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("upcoming");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AppointmentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);

  const isDev = me?.accessRole === "dev";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/appointments");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setAppointments(data.appointments);
    } catch {
      setError("Couldn't load appointments. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount; `load` also re-runs after admin actions below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const weekEndIso = useMemo(() => new Date(new Date().getTime() + 7 * 86_400_000).toISOString(), []);
  const todayBounds = useMemo(() => {
    const today = todayLocalDateStr();
    const start = zonedDateMinutesToUtc(today, 0);
    const end = zonedDateMinutesToUtc(today, 24 * 60);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments.filter((a) => {
      if (range === "upcoming" && a.startAt < nowIso) return false;
      if (range === "past" && a.startAt >= nowIso) return false;
      if (range === "today" && (a.startAt < todayBounds.startIso || a.startAt >= todayBounds.endIso)) return false;
      if (!q) return true;
      return (
        a.clientName.toLowerCase().includes(q) ||
        a.clientEmail.toLowerCase().includes(q) ||
        a.clientPhone.toLowerCase().includes(q) ||
        a.serviceName.toLowerCase().includes(q) ||
        a.stylistName.toLowerCase().includes(q) ||
        a.confirmationCode.toLowerCase().includes(q)
      );
    });
  }, [appointments, range, search, nowIso, todayBounds]);

  const stats = useMemo(() => {
    const notCancelled = appointments.filter((a) => a.status !== "cancelled");
    return {
      today: notCancelled.filter((a) => a.startAt >= todayBounds.startIso && a.startAt < todayBounds.endIso).length,
      next7Days: notCancelled.filter((a) => a.startAt >= nowIso && a.startAt < weekEndIso).length,
      upcoming: notCancelled.filter((a) => a.startAt >= nowIso).length,
    };
  }, [appointments, nowIso, weekEndIso, todayBounds]);

  async function performAction(id: string, body: Record<string, unknown>) {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "That action failed.");
        return;
      }
      await load();
    } catch {
      setActionError("Network error — please try again.");
    }
  }

  async function deleteAppointment(id: string) {
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "That action failed.");
        return;
      }
      setDeleteTarget(null);
      await load();
    } catch {
      setActionError("Network error — please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">Dashboard</p>
      <h1 className="page-title">Appointments</h1>

      <div className="admin-stat-row">
        <div className="admin-stat-card">
          <span className="admin-stat-value">{stats.today}</span>
          <span className="admin-stat-label">Today</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-value">{stats.next7Days}</span>
          <span className="admin-stat-label">Next 7 days</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-value">{stats.upcoming}</span>
          <span className="admin-stat-label">All upcoming</span>
        </div>
      </div>

      <NewAppointmentForm onCreated={load} />

      <div className="admin-appointments-toolbar">
        <div className="booking-date-row" role="group" aria-label="Filter appointments">
          {(["upcoming", "today", "all", "past"] as RangeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`booking-date-chip${range === key ? " is-selected" : ""}`}
              onClick={() => setRange(key)}
              aria-pressed={range === key}
            >
              {key === "upcoming" && "Upcoming"}
              {key === "today" && "Today"}
              {key === "all" && "All"}
              {key === "past" && "Past"}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="admin-appointments-search"
          placeholder="Search client, service, stylist, code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search appointments"
        />
      </div>

      <div aria-live="polite">
        {error && <p className="form-error">{error}</p>}
        {actionError && <p className="form-error">{actionError}</p>}
        {loading && <p>Loading appointments&hellip;</p>}
      </div>

      {!loading && filtered.length === 0 && appointments.length > 0 && <p>No appointments match this filter.</p>}
      {!loading && appointments.length === 0 && <p>No appointments in this view.</p>}

      {!loading && filtered.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Service</th>
                <th scope="col">Stylist</th>
                <th scope="col">Client</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice()
                .sort((a, b) => a.startAt.localeCompare(b.startAt))
                .map((a) => {
                  const start = new Date(a.startAt);
                  return (
                    <tr key={a.id}>
                      <td data-label="When">
                        {formatLocalDate(start)}
                        <br />
                        {formatLocalTime(start)}
                      </td>
                      <td data-label="Service">{a.serviceName}</td>
                      <td data-label="Stylist">{a.stylistName}</td>
                      <td data-label="Client">
                        {a.clientName}
                        <br />
                        <a href={`tel:${a.clientPhone}`}>{a.clientPhone}</a>
                        <br />
                        <a href={`mailto:${a.clientEmail}`}>{a.clientEmail}</a>
                        {a.notes && (
                          <>
                            <br />
                            <em>{a.notes}</em>
                          </>
                        )}
                      </td>
                      <td data-label="Status">
                        <span className={`admin-status-badge admin-status-${a.status}`}>{a.status}</span>
                      </td>
                      <td data-label="Actions">
                        <div className="admin-row-actions">
                          {a.status !== "confirmed" && a.status !== "cancelled" && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => performAction(a.id, { action: "confirm" })}
                            >
                              Confirm
                            </button>
                          )}
                          {a.status !== "cancelled" && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => performAction(a.id, { action: "cancel" })}
                            >
                              Cancel
                            </button>
                          )}
                          {rescheduleId === a.id ? (
                            <>
                              <input
                                type="datetime-local"
                                value={rescheduleValue}
                                onChange={(e) => setRescheduleValue(e.target.value)}
                                aria-label={`New date and time for ${a.clientName}'s appointment`}
                              />
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={async () => {
                                  if (!rescheduleValue) return;
                                  await performAction(a.id, {
                                    action: "reschedule",
                                    startAt: new Date(rescheduleValue).toISOString(),
                                  });
                                  setRescheduleId(null);
                                }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setRescheduleId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            a.status !== "cancelled" && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  setRescheduleId(a.id);
                                  setRescheduleValue("");
                                }}
                              >
                                Reschedule
                              </button>
                            )
                          )}
                          {isDev && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-danger"
                              onClick={() => setDeleteTarget(a)}
                            >
                              Delete
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

      {deleteTarget && (
        <div className="admin-modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <p>
              Permanently delete {deleteTarget.clientName}&rsquo;s {deleteTarget.serviceName} appointment on{" "}
              {formatLocalDate(new Date(deleteTarget.startAt))}? This removes it from the database entirely and
              cannot be undone.
            </p>
            <div className="admin-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-danger"
                onClick={() => deleteAppointment(deleteTarget.id)}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
