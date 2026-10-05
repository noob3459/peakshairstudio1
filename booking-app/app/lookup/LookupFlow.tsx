"use client";

import { useMemo, useState } from "react";
import BookingHeader from "../components/BookingHeader";
import SiteFooter from "../components/SiteFooter";
import { formatLocalDate, formatLocalTime } from "@/lib/timezone";

type AppointmentResult = {
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
  servicePriceCents: number | null;
  stylistName: string;
  bookedByName: string | null;
};

function formatPrice(cents: number | null): string {
  return cents == null ? "Call to confirm pricing" : `$${(cents / 100).toFixed(2)}`;
}

function bookedByLabel(name: string | null): string {
  if (!name) return "Not recorded (booked before this history was tracked)";
  return name === "Client (self-booked)" ? "You (booked online)" : `${name} (staff)`;
}

export default function LookupFlow() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<AppointmentResult[]>([]);
  const [receipt, setReceipt] = useState<AppointmentResult | null>(null);

  const { upcoming, past } = useMemo(() => {
    const nowIso = new Date().toISOString();
    const upcoming = results.filter((a) => a.startAt >= nowIso).sort((a, b) => a.startAt.localeCompare(b.startAt));
    const past = results
      .filter((a) => a.startAt < nowIso)
      .sort((a, b) => b.startAt.localeCompare(a.startAt));
    return { upcoming, past };
  }, [results]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() && !phone.trim()) {
      setError("Enter an email or phone number.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/appointments/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setResults([]);
        setSearched(true);
        return;
      }
      setResults(data.appointments);
      setSearched(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderCard(a: AppointmentResult) {
    const start = new Date(a.startAt);
    return (
      <li key={a.id} className="lookup-card">
        <div className="lookup-card-main">
          <p className="lookup-card-when">
            {formatLocalDate(start)} at {formatLocalTime(start)}
          </p>
          <p>
            <strong>{a.serviceName}</strong> with {a.stylistName}
          </p>
          <span className={`admin-status-badge admin-status-${a.status}`}>{a.status}</span>
        </div>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setReceipt(a)}>
          View Receipt
        </button>
      </li>
    );
  }

  return (
    <>
      <BookingHeader />
      <main id="main" className="section lookup-page">
        <div className="container" style={{ maxWidth: "40em" }}>
          <p className="eyebrow">My Appointments</p>
          <h1 className="page-title">Look Up Your Appointments</h1>
          <p className="section-intro">
            Enter the email or phone number you booked with to see your upcoming and past appointments.
          </p>

          <form onSubmit={handleSubmit} className="lookup-form">
            <div className="form-field">
              <label htmlFor="lookup-email">Email</label>
              <input
                id="lookup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
            <div className="form-field">
              <label htmlFor="lookup-phone">Phone</label>
              <input
                id="lookup-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="(760) 555-0123"
              />
            </div>
            <p className="booking-option-meta">Enter either one — you don&rsquo;t need both.</p>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Searching…" : "Find My Appointments"}
            </button>
          </form>

          {searched && !error && (
            <div className="lookup-results">
              {results.length === 0 ? (
                <p>No appointments found for that email or phone number.</p>
              ) : (
                <>
                  {upcoming.length > 0 && (
                    <section>
                      <h2 className="lookup-section-title">Upcoming</h2>
                      <ul className="lookup-card-list">{upcoming.map(renderCard)}</ul>
                    </section>
                  )}
                  {past.length > 0 && (
                    <section>
                      <h2 className="lookup-section-title">Past</h2>
                      <ul className="lookup-card-list">{past.map(renderCard)}</ul>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />

      {receipt && (
        <div className="admin-modal-backdrop" onClick={() => setReceipt(null)}>
          <div className="admin-modal receipt-print" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Receipt</p>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem", marginTop: 0 }}>
              Peaks Hair Studio
            </h2>
            <p className="booking-option-meta">Confirmation code: {receipt.confirmationCode}</p>
            <table className="receipt-table">
              <tbody>
                <tr>
                  <th scope="row">Client</th>
                  <td>{receipt.clientName}</td>
                </tr>
                <tr>
                  <th scope="row">Contact</th>
                  <td>
                    {receipt.clientEmail}
                    <br />
                    {receipt.clientPhone}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Service</th>
                  <td>{receipt.serviceName}</td>
                </tr>
                <tr>
                  <th scope="row">Price</th>
                  <td>{formatPrice(receipt.servicePriceCents)}</td>
                </tr>
                <tr>
                  <th scope="row">Stylist</th>
                  <td>{receipt.stylistName}</td>
                </tr>
                <tr>
                  <th scope="row">Date &amp; time</th>
                  <td>
                    {formatLocalDate(new Date(receipt.startAt))} at {formatLocalTime(new Date(receipt.startAt))}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Status</th>
                  <td>
                    <span className={`admin-status-badge admin-status-${receipt.status}`}>{receipt.status}</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Booked by</th>
                  <td>{bookedByLabel(receipt.bookedByName)}</td>
                </tr>
                {receipt.notes && (
                  <tr>
                    <th scope="row">Notes</th>
                    <td>{receipt.notes}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="admin-modal-actions no-print">
              <button type="button" className="btn btn-secondary" onClick={() => setReceipt(null)}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
