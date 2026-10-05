"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type EventAction = "created" | "confirmed" | "cancelled" | "rescheduled";

type AppointmentEvent = {
  id: string;
  appointmentId: string | null;
  action: EventAction;
  actorStylistId: string | null;
  actorName: string;
  clientName: string;
  serviceName: string;
  stylistName: string;
  startAt: string;
  previousStartAt: string | null;
  createdAt: string;
};

type StylistOption = { id: string; name: string };

const ACTION_LABEL: Record<EventAction, string> = {
  created: "Created",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminActivityPage() {
  const [events, setEvents] = useState<AppointmentEvent[]>([]);
  const [stylists, setStylists] = useState<StylistOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, stylistsRes] = await Promise.all([
        fetch("/api/admin/appointment-log"),
        fetch("/api/admin/stylists"),
      ]);
      if (!eventsRes.ok) {
        setError(
          eventsRes.status === 403
            ? "This log is only available to the developer account."
            : "Couldn't load the activity log. Please refresh.",
        );
        return;
      }
      const eventsData = await eventsRes.json();
      setEvents(eventsData.events);
      if (stylistsRes.ok) {
        const stylistsData = await stylistsRes.json();
        setStylists(stylistsData.stylists.map((s: StylistOption) => ({ id: s.id, name: s.name })));
      }
    } catch {
      setError("Couldn't load the activity log. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (actorFilter === "client" && e.actorStylistId !== null) return false;
      if (actorFilter !== "all" && actorFilter !== "client" && e.actorStylistId !== actorFilter) return false;
      if (!q) return true;
      return (
        e.clientName.toLowerCase().includes(q) ||
        e.serviceName.toLowerCase().includes(q) ||
        e.stylistName.toLowerCase().includes(q) ||
        e.actorName.toLowerCase().includes(q)
      );
    });
  }, [events, actorFilter, search]);

  return (
    <div>
      <p className="eyebrow">Dashboard</p>
      <h1 className="page-title">Activity Log</h1>
      <p className="section-intro">
        Every appointment created, confirmed, cancelled, or rescheduled, with who did it and when.
      </p>

      <div className="admin-appointments-toolbar">
        <select
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          aria-label="Filter by who made the change"
        >
          <option value="all">Everyone</option>
          {stylists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="client">Client (self-booked)</option>
        </select>
        <input
          type="text"
          className="admin-appointments-search"
          placeholder="Search client, service, stylist…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search activity log"
        />
      </div>

      <div aria-live="polite">
        {error && <p className="form-error">{error}</p>}
        {loading && <p>Loading activity&hellip;</p>}
      </div>

      {!loading && !error && filtered.length === 0 && events.length > 0 && <p>No activity matches this filter.</p>}
      {!loading && !error && events.length === 0 && <p>No activity recorded yet.</p>}

      {!loading && !error && filtered.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Action</th>
                <th scope="col">Appointment Time</th>
                <th scope="col">Client</th>
                <th scope="col">Service</th>
                <th scope="col">Stylist</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td data-label="When">{formatDateTime(e.createdAt)}</td>
                  <td data-label="Action">
                    <span className={`admin-status-badge admin-status-${e.action === "cancelled" ? "cancelled" : e.action === "confirmed" ? "confirmed" : "pending"}`}>
                      {ACTION_LABEL[e.action]}
                    </span>
                  </td>
                  <td data-label="Appointment Time">
                    {formatDateTime(e.startAt)}
                    {e.action === "rescheduled" && e.previousStartAt && (
                      <>
                        <br />
                        <span className="booking-option-meta">was {formatDateTime(e.previousStartAt)}</span>
                      </>
                    )}
                  </td>
                  <td data-label="Client">{e.clientName}</td>
                  <td data-label="Service">{e.serviceName}</td>
                  <td data-label="Stylist">{e.stylistName}</td>
                  <td data-label="By">{e.actorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
