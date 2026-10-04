"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

type AvailabilityDay = {
  id: string;
  date: string; // YYYY-MM-DD
  isClosed: boolean;
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
};
type StylistSummary = { id: string; name: string; active: boolean; accessRole: string };
type MyAvailability = {
  id: string;
  name: string;
  bufferMinutes: number;
  instagramHandle: string | null;
  facebookHandle: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  days: AvailabilityDay[];
};

const MAX_DAYS_AHEAD = 365;

function todayStr(): string {
  // Matches lib/timezone.ts's SALON_TIMEZONE; this is only used to bound the
  // calendar/generator in the browser — the server independently enforces
  // the same bound using the real salon time zone.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
function formatHours(d: Pick<AvailabilityDay, "startMinute" | "endMinute">): string {
  if (d.startMinute == null || d.endMinute == null) return "";
  const fmt = (mins: number) => {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const ampm = h24 < 12 ? "AM" : "PM";
    return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
  };
  return `${fmt(d.startMinute)}–${fmt(d.endMinute)}`;
}
function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d);
}

export default function AdminAvailabilityPage() {
  const [me, setMe] = useState<{ id: string; accessRole: string } | null>(null);
  const [roster, setRoster] = useState<StylistSummary[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const [data, setData] = useState<MyAvailability | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const today = useMemo(() => todayStr(), []);
  const maxDate = useMemo(() => addDays(today, MAX_DAYS_AHEAD), [today]);

  const [viewMonth, setViewMonth] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y, month: m }; // month: 1-12
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayForm, setDayForm] = useState({ isClosed: false, start: "09:00", end: "17:00", note: "" });

  const [generatorForm, setGeneratorForm] = useState({
    weekdays: [2, 3, 4, 5] as number[], // Tue-Fri default
    start: "09:00",
    end: "17:00",
    weeks: 8,
  });
  const [generatorResult, setGeneratorResult] = useState<string | null>(null);

  const [contactForm, setContactForm] = useState({
    instagramHandle: "",
    facebookHandle: "",
    personalPhone: "",
    personalEmail: "",
  });
  const [contactSaved, setContactSaved] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((meData) => {
        setMe(meData);
        setViewingId(meData?.id ?? null);
        const canSwitch = meData?.accessRole === "manager" || meData?.accessRole === "dev";
        if (canSwitch) {
          fetch("/api/admin/stylists")
            .then((res) => (res.ok ? res.json() : { stylists: [] }))
            .then((d) => setRoster((d.stylists as StylistSummary[]).filter((s) => s.active)));
        }
      })
      .catch(() => setMe(null));
  }, []);

  const load = useCallback(async (stylistId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const url = stylistId ? `/api/admin/availability?stylistId=${stylistId}` : "/api/admin/availability";
      const res = await fetch(url);
      if (res.status === 404) {
        setError(
          "This account isn't linked to a stylist profile yet. Ask whoever set up your login to run the setup script again.",
        );
        setData(null);
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json.stylist);
      setIsOwnProfile(json.isOwnProfile);
      setContactForm({
        instagramHandle: json.stylist.instagramHandle ?? "",
        facebookHandle: json.stylist.facebookHandle ?? "",
        personalPhone: json.stylist.personalPhone ?? "",
        personalEmail: json.stylist.personalEmail ?? "",
      });
    } catch {
      setError("Couldn't load this schedule. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewingId !== null || me) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load(viewingId);
    }
  }, [viewingId, me, load]);

  function flashSaved() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  const daysByDate = useMemo(() => {
    const map = new Map<string, AvailabilityDay>();
    data?.days.forEach((d) => map.set(d.date, d));
    return map;
  }, [data]);

  const upcoming = useMemo(
    () => (data?.days ?? []).filter((d) => d.date >= today).slice(0, 14),
    [data, today],
  );

  function openDay(dateStr: string) {
    setSelectedDate(dateStr);
    const existing = daysByDate.get(dateStr);
    if (existing && !existing.isClosed && existing.startMinute != null && existing.endMinute != null) {
      setDayForm({
        isClosed: false,
        start: minutesToTimeInput(existing.startMinute),
        end: minutesToTimeInput(existing.endMinute),
        note: existing.note ?? "",
      });
    } else if (existing) {
      setDayForm({ isClosed: true, start: "09:00", end: "17:00", note: existing.note ?? "" });
    } else {
      setDayForm({ isClosed: false, start: "09:00", end: "17:00", note: "" });
    }
  }

  async function saveDay() {
    if (!selectedDate) return;
    setSavingKey("day-save");
    try {
      await fetch("/api/admin/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stylistId: viewingId,
          date: selectedDate,
          isClosed: dayForm.isClosed,
          startMinute: dayForm.isClosed ? undefined : timeInputToMinutes(dayForm.start),
          endMinute: dayForm.isClosed ? undefined : timeInputToMinutes(dayForm.end),
          note: dayForm.note || undefined,
        }),
      });
      await load(viewingId);
      flashSaved();
    } finally {
      setSavingKey(null);
    }
  }

  async function removeDay() {
    if (!selectedDate) return;
    setSavingKey("day-remove");
    try {
      await fetch("/api/admin/availability", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stylistId: viewingId, date: selectedDate }),
      });
      setSelectedDate(null);
      await load(viewingId);
    } finally {
      setSavingKey(null);
    }
  }

  async function runGenerator() {
    setSavingKey("generate");
    setGeneratorResult(null);
    try {
      const res = await fetch("/api/admin/availability/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stylistId: viewingId,
          weekdays: generatorForm.weekdays,
          startMinute: timeInputToMinutes(generatorForm.start),
          endMinute: timeInputToMinutes(generatorForm.end),
          weeks: generatorForm.weeks,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setGeneratorResult(json.error ?? "Couldn't generate availability.");
        return;
      }
      setGeneratorResult(`Set ${json.count} day${json.count === 1 ? "" : "s"}.`);
      await load(viewingId);
      flashSaved();
    } finally {
      setSavingKey(null);
    }
  }

  function toggleGeneratorWeekday(weekday: number) {
    setGeneratorForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(weekday)
        ? prev.weekdays.filter((w) => w !== weekday)
        : [...prev.weekdays, weekday].sort(),
    }));
  }

  async function saveBuffer(bufferMinutes: number) {
    setSavingKey("buffer");
    try {
      await fetch("/api/admin/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stylistId: viewingId, bufferMinutes }),
      });
      await load(viewingId);
      flashSaved();
    } finally {
      setSavingKey(null);
    }
  }

  async function saveContactInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSavingKey("contact");
    setContactError(null);
    setContactSaved(false);
    try {
      const res = await fetch(`/api/admin/stylists/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setContactError(body.error ?? "Couldn't save your contact info.");
        return;
      }
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 2500);
    } finally {
      setSavingKey(null);
    }
  }

  // Calendar grid for viewMonth: leading/trailing blanks so weekdays line up.
  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.year, viewMonth.month - 1, 1);
    const daysInMonth = new Date(viewMonth.year, viewMonth.month, 0).getDate();
    const leadingBlanks = firstOfMonth.getDay();
    const cells: Array<{ date: string | null }> = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null });
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${viewMonth.year}-${String(viewMonth.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ date });
    }
    return cells;
  }, [viewMonth]);

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(viewMonth.year, viewMonth.month - 1, 1),
  );
  const atMinMonth = `${viewMonth.year}-${String(viewMonth.month).padStart(2, "0")}` === today.slice(0, 7);
  const atMaxMonth = `${viewMonth.year}-${String(viewMonth.month).padStart(2, "0")}` === maxDate.slice(0, 7);

  function shiftMonth(delta: number) {
    setViewMonth((prev) => {
      let month = prev.month + delta;
      let year = prev.year;
      if (month < 1) {
        month = 12;
        year -= 1;
      } else if (month > 12) {
        month = 1;
        year += 1;
      }
      return { year, month };
    });
  }

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">{isOwnProfile ? "My Availability" : "Availability"}</p>
          <h1 className="page-title">{data ? data.name : "Availability"}</h1>
        </div>
        {savedFlash && <span className="admin-saved-flash">Saved</span>}
      </div>
      <p className="section-intro">
        {isOwnProfile
          ? "Only dates you set here are bookable — nothing is assumed. Pick dates on the calendar, or generate a recurring pattern for the next few weeks."
          : `Viewing ${data?.name ?? "this stylist"}'s schedule. Changes you make here apply immediately to what clients can book.`}
      </p>

      {roster.length > 1 && (
        <div className="admin-stylist-switcher" role="group" aria-label="Switch stylist">
          {me?.accessRole === "manager" && (
            <button
              type="button"
              className={`admin-switcher-chip${viewingId === me.id ? " is-active" : ""}`}
              onClick={() => setViewingId(me.id)}
            >
              My Own
            </button>
          )}
          {roster
            .filter((s) => s.id !== me?.id)
            .map((s) => (
              <button
                key={s.id}
                type="button"
                className={`admin-switcher-chip${viewingId === s.id ? " is-active" : ""}`}
                onClick={() => setViewingId(s.id)}
              >
                {s.name}
              </button>
            ))}
        </div>
      )}

      <div aria-live="polite">
        {error && <p className="form-error">{error}</p>}
        {loading && <p>Loading&hellip;</p>}
      </div>

      {!loading && data && (
        <>
          <section className="admin-card">
            <div className="admin-card-head">
              <h2>Generate a recurring schedule</h2>
            </div>
            <div className="admin-gen-row">
              <div className="admin-gen-weekdays" role="group" aria-label="Weekdays">
                {WEEKDAY_LETTER.map((letter, weekday) => (
                  <button
                    key={weekday}
                    type="button"
                    className={`admin-gen-day-pill${generatorForm.weekdays.includes(weekday) ? " is-active" : ""}`}
                    aria-pressed={generatorForm.weekdays.includes(weekday)}
                    aria-label={WEEKDAY_SHORT[weekday]}
                    onClick={() => toggleGeneratorWeekday(weekday)}
                  >
                    {letter}
                  </button>
                ))}
              </div>
              <input
                type="time"
                aria-label="Start time"
                value={generatorForm.start}
                onChange={(e) => setGeneratorForm((p) => ({ ...p, start: e.target.value }))}
              />
              <span aria-hidden="true">&ndash;</span>
              <input
                type="time"
                aria-label="End time"
                value={generatorForm.end}
                onChange={(e) => setGeneratorForm((p) => ({ ...p, end: e.target.value }))}
              />
              <span className="admin-gen-for">for the next</span>
              <input
                type="number"
                min={1}
                max={52}
                className="admin-gen-weeks"
                aria-label="Number of weeks"
                value={generatorForm.weeks}
                onChange={(e) =>
                  setGeneratorForm((p) => ({ ...p, weeks: Math.max(1, Math.min(52, Number(e.target.value) || 1)) }))
                }
              />
              <span>weeks</span>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={runGenerator}
                disabled={savingKey === "generate" || generatorForm.weekdays.length === 0}
              >
                {savingKey === "generate" ? "Generating…" : "Generate"}
              </button>
            </div>
            {generatorResult && <p className="booking-option-meta">{generatorResult}</p>}
          </section>

          <section className="admin-card">
            <div className="admin-card-head">
              <h2>Calendar</h2>
              <div className="admin-buffer-control">
                <label htmlFor="buffer">Buffer between appointments</label>
                <div className="admin-buffer-input">
                  <input
                    id="buffer"
                    type="number"
                    min={0}
                    max={240}
                    step={5}
                    defaultValue={data.bufferMinutes}
                    onBlur={(e) => saveBuffer(Number(e.target.value))}
                    disabled={savingKey === "buffer"}
                  />
                  <span>min</span>
                </div>
              </div>
            </div>

            <div className="admin-cal-nav">
              <button type="button" className="admin-cal-nav-btn" onClick={() => shiftMonth(-1)} disabled={atMinMonth} aria-label="Previous month">
                &larr;
              </button>
              <strong>{monthLabel}</strong>
              <button type="button" className="admin-cal-nav-btn" onClick={() => shiftMonth(1)} disabled={atMaxMonth} aria-label="Next month">
                &rarr;
              </button>
            </div>

            <div className="admin-cal-weekdays" aria-hidden="true">
              {WEEKDAY_LETTER.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
            <div className="admin-cal-grid">
              {calendarCells.map((cell, i) => {
                if (!cell.date) return <span key={i} className="admin-cal-cell is-blank" />;
                const inRange = cell.date >= today && cell.date <= maxDate;
                const day = daysByDate.get(cell.date);
                const state = !day ? "unset" : day.isClosed ? "closed" : "open";
                return (
                  <button
                    key={cell.date}
                    type="button"
                    className={`admin-cal-cell is-day is-${state}${selectedDate === cell.date ? " is-selected" : ""}`}
                    disabled={!inRange}
                    onClick={() => openDay(cell.date!)}
                    title={day && !day.isClosed ? formatHours(day) : undefined}
                  >
                    {Number(cell.date.slice(8, 10))}
                  </button>
                );
              })}
            </div>
            <p className="admin-cal-legend">
              <span className="admin-cal-dot is-open" aria-hidden="true" /> Available
              <span className="admin-cal-dot is-closed" aria-hidden="true" /> Closed
              <span className="admin-cal-dot is-unset" aria-hidden="true" /> Not set (not bookable)
            </p>

            {selectedDate && (
              <div className="admin-day-panel">
                <div className="admin-day-panel-head">
                  <strong>{formatDateLabel(selectedDate)}</strong>
                  <button type="button" className="admin-copy-link" onClick={() => setSelectedDate(null)}>
                    Close
                  </button>
                </div>
                <label className="booking-checkbox" style={{ marginBottom: "0.6rem" }}>
                  <input
                    type="checkbox"
                    checked={dayForm.isClosed}
                    onChange={(e) => setDayForm((p) => ({ ...p, isClosed: e.target.checked }))}
                  />
                  Closed all day
                </label>
                {!dayForm.isClosed && (
                  <div className="admin-day-panel-times">
                    <input
                      type="time"
                      aria-label="Start time"
                      value={dayForm.start}
                      onChange={(e) => setDayForm((p) => ({ ...p, start: e.target.value }))}
                    />
                    <span aria-hidden="true">&ndash;</span>
                    <input
                      type="time"
                      aria-label="End time"
                      value={dayForm.end}
                      onChange={(e) => setDayForm((p) => ({ ...p, end: e.target.value }))}
                    />
                  </div>
                )}
                <div className="admin-day-panel-actions">
                  <button type="button" className="btn btn-primary btn-small" onClick={saveDay} disabled={savingKey === "day-save"}>
                    Save
                  </button>
                  {daysByDate.has(selectedDate) && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={removeDay}
                      disabled={savingKey === "day-remove"}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="admin-card">
            <div className="admin-card-head">
              <h2>Upcoming</h2>
            </div>
            {upcoming.length === 0 && <p className="booking-option-meta">Nothing set yet — add dates above.</p>}
            {upcoming.length > 0 && (
              <ul className="admin-upcoming-list">
                {upcoming.map((d) => (
                  <li key={d.id} className="admin-upcoming-row">
                    <span>{formatDateLabel(d.date)}</span>
                    <span className="admin-exception-detail">{d.isClosed ? "Closed" : formatHours(d)}</span>
                    <button type="button" className="admin-copy-link" onClick={() => openDay(d.date)}>
                      Edit
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isOwnProfile && (
            <section className="admin-card">
              <div className="admin-card-head">
                <h2>Contact &amp; social</h2>
              </div>
              <p className="booking-option-meta" style={{ marginBottom: "1rem" }}>
                Shown on the public team page. Leave blank to hide a field.
              </p>
              <form onSubmit={saveContactInfo} className="admin-contact-form">
                <div className="form-field">
                  <label htmlFor="instagram">Instagram handle</label>
                  <input
                    id="instagram"
                    type="text"
                    placeholder="your_handle"
                    value={contactForm.instagramHandle}
                    onChange={(e) => setContactForm((p) => ({ ...p, instagramHandle: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="facebook">Facebook (optional)</label>
                  <input
                    id="facebook"
                    type="text"
                    placeholder="your.facebook.page"
                    value={contactForm.facebookHandle}
                    onChange={(e) => setContactForm((p) => ({ ...p, facebookHandle: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="phone">Phone number (optional)</label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="760-555-0123"
                    value={contactForm.personalPhone}
                    onChange={(e) => setContactForm((p) => ({ ...p, personalPhone: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="email">Email (optional)</label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={contactForm.personalEmail}
                    onChange={(e) => setContactForm((p) => ({ ...p, personalEmail: e.target.value }))}
                  />
                </div>
                <div aria-live="polite">{contactError && <p className="form-error">{contactError}</p>}</div>
                <div className="admin-contact-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={savingKey === "contact"}>
                    {savingKey === "contact" ? "Saving…" : "Save contact info"}
                  </button>
                  {contactSaved && <span className="admin-saved-flash">Saved</span>}
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
