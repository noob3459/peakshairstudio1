"use client";

import { useCallback, useEffect, useState } from "react";

const PAGE_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "services", label: "Services" },
  { value: "team", label: "Meet the Team" },
  { value: "story", label: "Our Story" },
  { value: "grand-opening", label: "Grand Opening" },
  { value: "join-the-team", label: "Join the Team" },
  { value: "visit", label: "Visit / Location & Hours" },
  { value: "other", label: "Other / not sure" },
] as const;

const PAGE_LABEL = Object.fromEntries(PAGE_OPTIONS.map((p) => [p.value, p.label]));

type Proposal = {
  id: string;
  page: string;
  content: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
  submittedByName: string;
  submittedByStylistId: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function proposalToText(p: Proposal): string {
  return `[${PAGE_LABEL[p.page] ?? p.page}] submitted ${formatDate(p.createdAt)} by ${p.submittedByName}\n${p.content}`;
}

export default function AdminProposalsPage() {
  const [me, setMe] = useState<{ accessRole: string } | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [page, setPage] = useState<string>("home");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, proposalsRes] = await Promise.all([fetch("/api/admin/me"), fetch("/api/admin/proposals")]);
      if (meRes.ok) setMe(await meRes.json());
      if (!proposalsRes.ok) {
        if (proposalsRes.status === 403) {
          setError("This area is for the owner and developer accounts only.");
          return;
        }
        throw new Error("Failed to load");
      }
      const data = await proposalsRes.json();
      setProposals(data.proposals);
    } catch {
      setError("Couldn't load proposed changes. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function submitProposal(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, content: content.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSubmitError(d.error ?? "Couldn't submit that.");
        return;
      }
      setContent("");
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2500);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(id: string, status: "open" | "resolved") {
    setBusyId(id);
    try {
      await fetch(`/api/admin/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function removeProposal(id: string) {
    if (!confirm("Remove this proposed change?")) return;
    setBusyId(id);
    try {
      await fetch(`/api/admin/proposals/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function copyOne(p: Proposal) {
    try {
      await navigator.clipboard.writeText(proposalToText(p));
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — not worth a hard error.
    }
  }

  function exportAll() {
    const text = visible.map(proposalToText).join("\n\n---\n\n");
    const blob = new Blob([text || "No proposed changes."], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peaks-proposed-changes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyAll() {
    const text = visible.map(proposalToText).join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId("__all__");
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  }

  const visible = proposals.filter((p) => filter === "all" || p.status === filter);

  const isDev = me?.accessRole === "dev";

  return (
    <div>
      <p className="eyebrow">{isDev ? "Review" : "Suggest"}</p>
      <h1 className="page-title">{isDev ? "Proposed Changes" : "Propose a Change"}</h1>
      <p className="section-intro">
        {isDev
          ? "Reyna's suggested edits to the public site. Nothing here changes the live pages automatically — review, then apply it yourself and mark it resolved."
          : "Describe a change you'd like made to the website. This goes to Aidenn's review queue — it won't change the live site by itself, and updates happen on your agreed schedule."}
      </p>

      <div aria-live="polite">{error && <p className="form-error">{error}</p>}</div>

      {!isDev && !error && (
        <section className="admin-card">
          <form onSubmit={submitProposal}>
            <div className="form-field">
              <label htmlFor="page-select">Which page?</label>
              <select id="page-select" value={page} onChange={(e) => setPage(e.target.value)}>
                {PAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="content">What would you like changed?</label>
              <textarea
                id="content"
                rows={5}
                placeholder="Be as specific as you'd like — exact wording, what to remove, a new photo to use, anything."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div aria-live="assertive">{submitError && <p className="form-error">{submitError}</p>}</div>
            <div className="admin-contact-form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting || !content.trim()}>
                {submitting ? "Submitting…" : "Submit Proposal"}
              </button>
              {submitted && <span className="admin-saved-flash">Submitted</span>}
            </div>
          </form>
        </section>
      )}

      {!loading && !error && (
        <section>
          <div className="admin-card-head" style={{ marginTop: "2rem" }}>
            <h2>{isDev ? "All proposals" : "Your submissions"}</h2>
            <div className="admin-row-actions">
              <div className="booking-date-row" style={{ marginBottom: 0 }}>
                {(["open", "resolved", "all"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`booking-date-chip${filter === key ? " is-selected" : ""}`}
                    onClick={() => setFilter(key)}
                    aria-pressed={filter === key}
                  >
                    {key === "open" ? "Open" : key === "resolved" ? "Resolved" : "All"}
                  </button>
                ))}
              </div>
              {isDev && visible.length > 0 && (
                <>
                  <button type="button" className="btn btn-secondary btn-small" onClick={copyAll}>
                    {copiedId === "__all__" ? "Copied!" : "Copy All"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-small" onClick={exportAll}>
                    Export .txt
                  </button>
                </>
              )}
            </div>
          </div>

          {visible.length === 0 && <p className="booking-option-meta">Nothing here.</p>}

          <ul className="admin-proposal-list">
            {visible.map((p) => (
              <li key={p.id} className={`admin-proposal-card${p.status === "resolved" ? " is-resolved" : ""}`}>
                <div className="admin-proposal-meta">
                  <span className="admin-status-badge admin-status-confirmed">{PAGE_LABEL[p.page] ?? p.page}</span>
                  <span className="booking-option-meta">
                    {isDev ? `${p.submittedByName} · ` : ""}
                    {formatDate(p.createdAt)}
                  </span>
                  {p.status === "resolved" && <span className="admin-status-badge admin-status-cancelled">resolved</span>}
                </div>
                <p className="admin-proposal-content">{p.content}</p>
                <div className="admin-row-actions">
                  {isDev && (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => copyOne(p)}>
                      {copiedId === p.id ? "Copied!" : "Copy"}
                    </button>
                  )}
                  {isDev && p.status === "open" && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => setStatus(p.id, "resolved")}
                      disabled={busyId === p.id}
                    >
                      Mark resolved
                    </button>
                  )}
                  {isDev && p.status === "resolved" && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => setStatus(p.id, "open")}
                      disabled={busyId === p.id}
                    >
                      Reopen
                    </button>
                  )}
                  {(isDev || p.status === "open") && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => removeProposal(p.id)}
                      disabled={busyId === p.id}
                    >
                      {isDev ? "Delete" : "Retract"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
