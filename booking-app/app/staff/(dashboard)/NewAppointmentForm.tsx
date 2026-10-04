"use client";

import { useEffect, useMemo, useState } from "react";
import { todayLocalDateStr } from "@/lib/timezone";

type ServiceOption = {
  id: string;
  slug: string;
  name: string;
  durationMinutes: number | null;
  priceCents: number | null;
};

type StylistOption = {
  id: string;
  name: string;
  role: string;
};

type CreatedAppointment = {
  id: string;
  confirmationCode: string;
  clientName: string;
  serviceName: string;
  stylistName: string;
  localDateLabel: string;
  localTimeLabel: string;
  status: "pending" | "confirmed";
};

// Salon business day: 8:00 AM to 6:00 PM, 30-minute increments (matches public booking slots).
const TIME_SLOTS = (() => {
  const slots: number[] = [];
  for (let m = 8 * 60; m <= 18 * 60; m += 30) slots.push(m);
  return slots;
})();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatSlotLabel(dateStr: string, minute: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setMinutes(minute);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
}

function formatPrice(cents: number | null): string {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function NewAppointmentForm({ onCreated }: { onCreated?: () => void }) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [stylists, setStylists] = useState<StylistOption[]>([]);
  const [listsReady, setListsReady] = useState(false);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [stylistId, setStylistId] = useState("");
  const [date, setDate] = useState(() => todayLocalDateStr());
  const [startMinute, setStartMinute] = useState(9 * 60);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [status, setStatus] = useState<"pending" | "confirmed">("confirmed");
  const [notes, setNotes] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreatedAppointment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [servicesRes, stylistsRes] = await Promise.all([
          fetch("/api/services", { cache: "no-store" }),
          fetch("/api/stylists", { cache: "no-store" }),
        ]);
        if (!servicesRes.ok || !stylistsRes.ok) return;
        const [servicesData, stylistsData] = await Promise.all([servicesRes.json(), stylistsRes.json()]);
        if (cancelled) return;
        setServices(servicesData.services ?? []);
        setStylists(stylistsData.stylists ?? []);
      } catch {
        // Form still works; the server surfaces a clear 404 if a bad ID is submitted.
      } finally {
        if (!cancelled) setListsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const timeOptions = useMemo(
    () => TIME_SLOTS.map((m) => ({ value: m, label: formatSlotLabel(date, m) })),
    [date],
  );

  function clearError(key: string) {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleServiceChange(id: string) {
    setServiceId(id);
    clearError("serviceId");
    const svc = services.find((s) => s.id === id);
    if (svc?.durationMinutes) {
      setDurationMinutes(svc.durationMinutes);
    }
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!clientName.trim()) errors.clientName = "Client name is required";
    else if (clientName.trim().length > 200) errors.clientName = "Name is too long (max 200 characters)";
    if (!clientEmail.trim()) errors.clientEmail = "Email is required";
    else if (!EMAIL_RE.test(clientEmail.trim())) errors.clientEmail = "Enter a valid email";
    const phone = clientPhone.trim();
    if (phone.length < 7) errors.clientPhone = "Enter a valid phone number";
    else if (phone.length > 32 || !/^[0-9()+\-. ]+$/.test(phone)) errors.clientPhone = "Enter a valid phone number";
    if (!serviceId) errors.serviceId = "Pick a service";
    if (!stylistId) errors.stylistId = "Pick a stylist";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "Enter a valid date";
    if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439)
      errors.startMinute = "Pick a start time";
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 600)
      errors.durationMinutes = "Duration must be 15–600 minutes";
    if (notes.length > 500) errors.notes = "Notes are too long (max 500 characters)";
    return errors;
  }


  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setSuccess(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          clientPhone: clientPhone.trim(),
          serviceId,
          stylistId,
          date,
          startMinute,
          durationMinutes,
          status,
          notes: notes.trim() || undefined,
          marketingOptIn,
        }),
      });

      let data: {
        appointment?: CreatedAppointment;
        error?: string;
        issues?: { fieldErrors?: Record<string, string[]> };
      };
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (res.status === 201 && data.appointment) {
        const created = data.appointment;
        setSuccess(created);
        // Reset the form for the next entry.
        setClientName("");
        setClientEmail("");
        setClientPhone("");
        setServiceId("");
        setStylistId("");
        setDate(todayLocalDateStr());
        setStartMinute(9 * 60);
        setDurationMinutes(60);
        setStatus("confirmed");
        setNotes("");
        setMarketingOptIn(false);
        setFieldErrors({});
        onCreated?.();
        return;
      }

      if (res.status === 400 && data.issues?.fieldErrors) {
        const mapped: Record<string, string> = {};
        for (const [field, messages] of Object.entries(data.issues.fieldErrors)) {
          if (Array.isArray(messages) && messages.length > 0) mapped[field] = messages[0];
        }
        setFieldErrors(mapped);
        setSubmitError(data.error ?? "Please check the form for errors.");
        return;
      }

      if (res.status === 401) {
        setSubmitError("You're signed out — sign in to create appointments.");
        return;
      }

      setSubmitError(data.error ?? `That request failed (HTTP ${res.status}).`);
    } catch {
      setSubmitError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedService = services.find((s) => s.id === serviceId);


  return (
    <details className="admin-card admin-new-appointment" aria-labelledby="new-appointment-heading">
      <summary className="admin-card-head" aria-label="Toggle new appointment form">
        <h2 id="new-appointment-heading">New appointment</h2>
        <span className="admin-pill">All times are Pacific Time</span>
        <span className="admin-collapse-chevron" aria-hidden="true">▾</span>
      </summary>

      <form onSubmit={handleSubmit} noValidate>
        <div className="admin-form-grid">
          <div className="form-field">
            <label htmlFor="na-client-name">Client name *</label>
            <input
              id="na-client-name"
              type="text"
              value={clientName}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => {
                setClientName(e.target.value);
                clearError("clientName");
              }}
              aria-invalid={fieldErrors.clientName ? "true" : undefined}
              placeholder="Jordan Smith"
            />
            {fieldErrors.clientName && <p className="form-error">{fieldErrors.clientName}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="na-client-email">Email *</label>
            <input
              id="na-client-email"
              type="email"
              value={clientEmail}
              autoComplete="off"
              onChange={(e) => {
                setClientEmail(e.target.value);
                clearError("clientEmail");
              }}
              aria-invalid={fieldErrors.clientEmail ? "true" : undefined}
              placeholder="jordan@example.com"
            />
            {fieldErrors.clientEmail && <p className="form-error">{fieldErrors.clientEmail}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="na-client-phone">Phone *</label>
            <input
              id="na-client-phone"
              type="tel"
              value={clientPhone}
              autoComplete="off"
              onChange={(e) => {
                setClientPhone(e.target.value);
                clearError("clientPhone");
              }}
              aria-invalid={fieldErrors.clientPhone ? "true" : undefined}
              placeholder="(555) 123-4567"
            />
            {fieldErrors.clientPhone && <p className="form-error">{fieldErrors.clientPhone}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="na-service">Service *</label>
            <select
              id="na-service"
              value={serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
              aria-invalid={fieldErrors.serviceId ? "true" : undefined}
              disabled={!listsReady && services.length === 0}
            >
              <option value="">
                {services.length === 0 && listsReady ? "No services available" : "Choose a service…"}
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.durationMinutes ? ` (${s.durationMinutes} min)` : ""}
                  {s.priceCents != null ? ` — ${formatPrice(s.priceCents)}` : ""}
                </option>
              ))}
            </select>
            {fieldErrors.serviceId && <p className="form-error">{fieldErrors.serviceId}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="na-stylist">Stylist *</label>
            <select
              id="na-stylist"
              value={stylistId}
              onChange={(e) => {
                setStylistId(e.target.value);
                clearError("stylistId");
              }}
              aria-invalid={fieldErrors.stylistId ? "true" : undefined}
              disabled={!listsReady && stylists.length === 0}
            >
              <option value="">
                {stylists.length === 0 && listsReady ? "No stylists available" : "Choose a stylist…"}
              </option>
              {stylists.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                  {st.role ? ` — ${st.role}` : ""}
                </option>
              ))}
            </select>
            {fieldErrors.stylistId && <p className="form-error">{fieldErrors.stylistId}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="na-date">Date *</label>
            <input
              id="na-date"
              type="date"
              value={date}
              min={todayLocalDateStr()}
              onChange={(e) => {
                setDate(e.target.value);
                clearError("date");
              }}
              aria-invalid={fieldErrors.date ? "true" : undefined}
            />
            {fieldErrors.date && <p className="form-error">{fieldErrors.date}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="na-time">Time *</label>
            <select
              id="na-time"
              value={startMinute}
              onChange={(e) => {
                setStartMinute(Number(e.target.value));
                clearError("startMinute");
              }}
              aria-invalid={fieldErrors.startMinute ? "true" : undefined}
            >
              {timeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {fieldErrors.startMinute && <p className="form-error">{fieldErrors.startMinute}</p>}
          </div>


          <div className="form-field">
            <label htmlFor="na-duration">Duration (minutes)</label>
            <input
              id="na-duration"
              type="number"
              min={15}
              max={600}
              step={15}
              value={durationMinutes}
              onChange={(e) => {
                setDurationMinutes(Number(e.target.value));
                clearError("durationMinutes");
              }}
              aria-invalid={fieldErrors.durationMinutes ? "true" : undefined}
            />
            {fieldErrors.durationMinutes && <p className="form-error">{fieldErrors.durationMinutes}</p>}
            {selectedService?.durationMinutes ? (
              <p className="form-hint">
                {selectedService.name} is normally {selectedService.durationMinutes} minutes.
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="na-status">Status</label>
            <select
              id="na-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "pending" | "confirmed")}
            >
              <option value="confirmed">Confirmed — send emails now</option>
              <option value="pending">Pending — hold emails until confirmed</option>
            </select>
          </div>

          <div className="form-field form-field-full">
            <label htmlFor="na-notes">Notes (optional)</label>
            <textarea
              id="na-notes"
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                clearError("notes");
              }}
              aria-invalid={fieldErrors.notes ? "true" : undefined}
              placeholder="Cut + color, prefers a quiet chair, has a trim reference photo…"
            />
            {fieldErrors.notes && <p className="form-error">{fieldErrors.notes}</p>}
          </div>
        </div>

        <label className="booking-checkbox">
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
          />
          Client opts in to marketing emails
        </label>

        <div aria-live="polite">
          {success && (
            <div className="admin-banner admin-banner-success">
              <strong>
                {success.status === "confirmed"
                  ? `Confirmed ${success.serviceName} for ${success.clientName}`
                  : `Created pending ${success.serviceName} for ${success.clientName}`}
              </strong>{" "}
              with {success.stylistName} — {success.localDateLabel} at {success.localTimeLabel}. Confirmation code:{" "}
              <code>{success.confirmationCode}</code>
            </div>
          )}
          {submitError && <p className="form-error">{submitError}</p>}
        </div>

        <div className="admin-form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Creating…" : "Create appointment"}
          </button>
        </div>
      </form>
    </details>
  );
}

