"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import BookingHeader from "../components/BookingHeader";
import SiteFooter from "../components/SiteFooter";
import { todayLocalDateStr, SALON_TIMEZONE } from "@/lib/timezone";

type ServiceDTO = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  priceCents: number | null;
};

type StylistDTO = {
  id: string;
  slug: string;
  name: string;
  role: string;
  bio: string | null;
};

type SlotDTO = {
  startAt: string;
  endAt: string;
  label: string;
  stylistId: string;
  stylistName?: string;
};

type ConfirmationResult = {
  confirmationCode: string;
  serviceName: string;
  stylistName: string;
  localDateLabel: string;
  localTimeLabel: string;
};

const STEPS = ["Service", "Stylist", "Date & Time", "Your Details", "Review"] as const;

function nextLocalDates(count: number): string[] {
  const dates: string[] = [];
  const start = new Date(`${todayLocalDateStr()}T12:00:00`);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return dates;
}

function formatDateChip(dateStr: string): { weekday: string; day: string } {
  const d = new Date(`${dateStr}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: SALON_TIMEZONE }).format(d),
    day: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: SALON_TIMEZONE }).format(d),
  };
}

function formatPrice(cents: number | null): string {
  return cents == null ? "" : `$${(cents / 100).toFixed(0)}`;
}

export default function BookingFlow() {
  const searchParams = useSearchParams();
  const preselectedStylistSlug = searchParams.get("stylist");

  const [step, setStep] = useState(1);
  const [services, setServices] = useState<ServiceDTO[]>([]);
  const [stylists, setStylists] = useState<StylistDTO[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState<string>("");
  const [stylistChoice, setStylistChoice] = useState<string>(""); // stylist id, or "any"

  const dates = useMemo(() => nextLocalDates(21), []);
  const [selectedDate, setSelectedDate] = useState<string>(dates[0]);
  const [slots, setSlots] = useState<SlotDTO[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotDTO | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ConfirmationResult | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [servicesRes, stylistsRes] = await Promise.all([
          fetch("/api/services"),
          fetch("/api/stylists"),
        ]);
        if (!servicesRes.ok || !stylistsRes.ok) throw new Error("Failed to load booking options");
        const servicesData = await servicesRes.json();
        const stylistsData = await stylistsRes.json();
        if (cancelled) return;
        setServices(servicesData.services);
        setStylists(stylistsData.stylists);
        if (preselectedStylistSlug) {
          const match = (stylistsData.stylists as StylistDTO[]).find(
            (s) => s.slug === preselectedStylistSlug,
          );
          if (match) setStylistChoice(match.id);
        }
      } catch {
        if (!cancelled) setOptionsError("We couldn't load booking options. Please refresh and try again.");
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [preselectedStylistSlug]);

  const loadSlots = useCallback(
    async (date: string) => {
      if (!serviceId) return;
      setLoadingSlots(true);
      setSlotsError(null);
      setSelectedSlot(null);
      try {
        const params = new URLSearchParams({ serviceId, date });
        if (stylistChoice && stylistChoice !== "any") params.set("stylistId", stylistChoice);
        const res = await fetch(`/api/availability?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load availability");
        const data = await res.json();
        setSlots(data.slots);
      } catch {
        setSlotsError("We couldn't load open times for that date. Please try another date.");
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [serviceId, stylistChoice],
  );

  useEffect(() => {
    // Re-fetches slots whenever the relevant selection changes while on step 3.
    if (step === 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadSlots(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedDate, serviceId, stylistChoice]);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const selectedStylistName =
    stylistChoice === "any"
      ? "No preference"
      : stylists.find((s) => s.id === (selectedSlot?.stylistId ?? stylistChoice))?.name ?? "";

  function validateContactStep(): boolean {
    const errors: Record<string, string> = {};
    if (!clientName.trim()) errors.clientName = "Name is required.";
    if (!clientEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      errors.clientEmail = "Enter a valid email address.";
    }
    if (!clientPhone.trim() || clientPhone.trim().length < 7) {
      errors.clientPhone = "Enter a valid phone number.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function goNext() {
    if (step === 1 && !serviceId) return;
    if (step === 2 && !stylistChoice) return;
    if (step === 3 && !selectedSlot) return;
    if (step === 4 && !validateContactStep()) return;
    setStep((s) => Math.min(s + 1, 5));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function submitBooking() {
    if (!selectedSlot || !serviceId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          stylistId: selectedSlot.stylistId,
          startAt: selectedSlot.startAt,
          clientName,
          clientEmail,
          clientPhone,
          notes: notes.trim() || undefined,
          marketingOptIn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult(data.appointment);
      setEmailSent(Boolean(data.emailSent));
    } catch {
      setSubmitError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <>
        <BookingHeader />
        <main id="main" className="section booking-confirmation">
          <div className="container" style={{ maxWidth: "40em" }}>
            <p className="eyebrow">Booked</p>
            <h1 className="page-title">You&rsquo;re all set, {clientName.split(" ")[0]}</h1>
            <p>
              <strong>{result.serviceName}</strong> with <strong>{result.stylistName}</strong>
              <br />
              {result.localDateLabel} at {result.localTimeLabel} (Apple Valley, CA local time)
            </p>
            <p>
              Confirmation code: <strong>{result.confirmationCode}</strong>
            </p>
            {emailSent ? (
              <p>A confirmation email is on its way to {clientEmail}.</p>
            ) : (
              <p role="status">
                We weren&rsquo;t able to confirm an email was sent right now, but your appointment is
                booked — please save your confirmation code above. Call {" "}
                <a href="tel:7604496456">760-449-6456</a> if you have any questions.
              </p>
            )}
            <p>
              To cancel or reschedule, call <a href="tel:7604496456">760-449-6456</a> or email{" "}
              <a href="mailto:peakshairstudio@gmail.com">peakshairstudio@gmail.com</a> and reference your
              confirmation code.
            </p>
            <a className="btn btn-primary" href="/home.html">
              Back to site
            </a>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <BookingHeader />
      <main id="main" className="section booking-flow">
        <div className="container" style={{ maxWidth: "40em" }}>
          <p className="eyebrow">Book an Appointment</p>
          <h1 className="page-title">Let&rsquo;s get you booked</h1>
          <p className="section-intro">
            A few quick steps: pick a service, choose your stylist, find a time that works, and
            you&rsquo;re done.
          </p>

          <ol className="booking-progress" aria-label="Booking steps">
            {STEPS.map((label, i) => {
              const n = i + 1;
              return (
                <li
                  key={label}
                  className={n === step ? "is-current" : n < step ? "is-done" : ""}
                  aria-current={n === step ? "step" : undefined}
                >
                  <span className="booking-progress-index" aria-hidden="true">
                    {n}
                  </span>
                  {label}
                </li>
              );
            })}
          </ol>

          <div aria-live="polite">
            {optionsError && <p className="form-error">{optionsError}</p>}
          </div>

          {loadingOptions ? (
            <p>Loading booking options&hellip;</p>
          ) : (
            <>
              {step === 1 && (
                <fieldset className="booking-fieldset">
                  <legend>Choose a service</legend>
                  <div className="booking-option-list">
                    {services.map((service) => (
                      <label key={service.id} className="booking-option">
                        <input
                          type="radio"
                          name="service"
                          value={service.id}
                          checked={serviceId === service.id}
                          onChange={() => setServiceId(service.id)}
                        />
                        <span className="booking-option-body">
                          <span className="booking-option-title">{service.name}</span>
                          <span className="booking-option-meta">
                            {service.durationMinutes ? `${service.durationMinutes} min` : "Contact the salon to confirm duration"}
                            {service.priceCents != null
                              ? ` · ${formatPrice(service.priceCents)}`
                              : service.durationMinutes
                                ? " · Contact the salon to confirm price"
                                : ""}
                          </span>
                          {service.description && (
                            <span className="booking-option-meta">{service.description}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {step === 2 && (
                <fieldset className="booking-fieldset">
                  <legend>Choose a stylist</legend>
                  <div className="booking-option-list">
                    <label className="booking-option">
                      <input
                        type="radio"
                        name="stylist"
                        value="any"
                        checked={stylistChoice === "any"}
                        onChange={() => setStylistChoice("any")}
                      />
                      <span className="booking-option-body">
                        <span className="booking-option-title">No preference</span>
                        <span className="booking-option-meta">We&rsquo;ll match you with the first available stylist.</span>
                      </span>
                    </label>
                    {stylists.map((stylist) => (
                      <label key={stylist.id} className="booking-option">
                        <input
                          type="radio"
                          name="stylist"
                          value={stylist.id}
                          checked={stylistChoice === stylist.id}
                          onChange={() => setStylistChoice(stylist.id)}
                        />
                        <span className="booking-option-body">
                          <span className="booking-option-title">{stylist.name}</span>
                          <span className="booking-option-meta">{stylist.role}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {step === 3 && (
                <div className="booking-fieldset">
                  <h2 className="booking-step-heading">Select a date</h2>
                  <div className="booking-date-row" role="group" aria-label="Choose a date">
                    {dates.map((date) => {
                      const { weekday, day } = formatDateChip(date);
                      return (
                        <button
                          key={date}
                          type="button"
                          className={`booking-date-chip${date === selectedDate ? " is-selected" : ""}`}
                          onClick={() => setSelectedDate(date)}
                          aria-pressed={date === selectedDate}
                        >
                          <span className="booking-date-chip-weekday">{weekday}</span>
                          <span className="booking-date-chip-day">{day}</span>
                        </button>
                      );
                    })}
                  </div>

                  <h2 className="booking-step-heading">Select a time</h2>
                  <div aria-live="polite">
                    {loadingSlots && <p>Loading available times&hellip;</p>}
                    {slotsError && <p className="form-error">{slotsError}</p>}
                    {!loadingSlots && !slotsError && slots.length === 0 && (
                      <p>No open times that day — try another date.</p>
                    )}
                  </div>
                  {!loadingSlots && slots.length > 0 && (
                    <div className="booking-time-grid" role="group" aria-label="Choose a time">
                      {slots.map((slot) => (
                        <button
                          key={`${slot.stylistId}-${slot.startAt}`}
                          type="button"
                          className={`booking-time-chip${
                            selectedSlot?.startAt === slot.startAt && selectedSlot?.stylistId === slot.stylistId
                              ? " is-selected"
                              : ""
                          }`}
                          onClick={() => setSelectedSlot(slot)}
                          aria-pressed={
                            selectedSlot?.startAt === slot.startAt && selectedSlot?.stylistId === slot.stylistId
                          }
                        >
                          {slot.label}
                          {stylistChoice === "any" && slot.stylistName && (
                            <span className="booking-time-chip-stylist"> &middot; {slot.stylistName}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <form className="booking-fieldset" onSubmit={(e) => e.preventDefault()}>
                  <h2 className="booking-step-heading">Your details</h2>
                  <div className="form-field">
                    <label htmlFor="clientName">
                      Name <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="clientName"
                      type="text"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.clientName)}
                      aria-describedby={fieldErrors.clientName ? "clientName-error" : undefined}
                    />
                    {fieldErrors.clientName && (
                      <p className="form-error" id="clientName-error">
                        {fieldErrors.clientName}
                      </p>
                    )}
                  </div>
                  <div className="form-field">
                    <label htmlFor="clientEmail">
                      Email <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="clientEmail"
                      type="email"
                      required
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.clientEmail)}
                      aria-describedby={fieldErrors.clientEmail ? "clientEmail-error" : undefined}
                    />
                    {fieldErrors.clientEmail && (
                      <p className="form-error" id="clientEmail-error">
                        {fieldErrors.clientEmail}
                      </p>
                    )}
                  </div>
                  <div className="form-field">
                    <label htmlFor="clientPhone">
                      Phone <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="clientPhone"
                      type="tel"
                      required
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.clientPhone)}
                      aria-describedby={fieldErrors.clientPhone ? "clientPhone-error" : undefined}
                    />
                    {fieldErrors.clientPhone && (
                      <p className="form-error" id="clientPhone-error">
                        {fieldErrors.clientPhone}
                      </p>
                    )}
                  </div>
                  <div className="form-field">
                    <label htmlFor="notes">Appointment notes (optional)</label>
                    <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <label className="booking-checkbox">
                    <input
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(e) => setMarketingOptIn(e.target.checked)}
                    />
                    Send me occasional news and offers from Peaks Hair Studio (optional)
                  </label>
                  <p className="booking-privacy-note">
                    Your name, email, phone, and any notes are used only to schedule and manage this
                    appointment, and to contact you about it. We don&rsquo;t sell your information.
                  </p>
                </form>
              )}

              {step === 5 && selectedSlot && selectedService && (
                <div className="booking-fieldset">
                  <h2 className="booking-step-heading">Review your appointment</h2>
                  <dl className="booking-review">
                    <div>
                      <dt>Service</dt>
                      <dd>{selectedService.name}</dd>
                    </div>
                    <div>
                      <dt>Stylist</dt>
                      <dd>{selectedSlot.stylistName ?? selectedStylistName}</dd>
                    </div>
                    <div>
                      <dt>Date &amp; time</dt>
                      <dd>
                        {formatDateChip(selectedDate).weekday}, {formatDateChip(selectedDate).day} at{" "}
                        {selectedSlot.label}
                      </dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd>
                        {selectedService.priceCents != null
                          ? formatPrice(selectedService.priceCents)
                          : "Contact the salon to confirm"}
                      </dd>
                    </div>
                    <div>
                      <dt>Name</dt>
                      <dd>{clientName}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{clientEmail}</dd>
                    </div>
                    <div>
                      <dt>Phone</dt>
                      <dd>{clientPhone}</dd>
                    </div>
                    {notes && (
                      <div>
                        <dt>Notes</dt>
                        <dd>{notes}</dd>
                      </div>
                    )}
                  </dl>
                  <p className="booking-privacy-note">
                    No deposit is required to book. We&rsquo;ll confirm your appointment by email.
                  </p>
                  <div aria-live="assertive">
                    {submitError && <p className="form-error">{submitError}</p>}
                  </div>
                </div>
              )}

              <div className="booking-nav">
                {step > 1 && (
                  <button type="button" className="btn btn-secondary" onClick={goBack} disabled={submitting}>
                    Back
                  </button>
                )}
                {step < 5 && (
                  <button type="button" className="btn btn-primary" onClick={goNext}>
                    Continue
                  </button>
                )}
                {step === 5 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={submitBooking}
                    disabled={submitting}
                  >
                    {submitting ? "Booking…" : "Confirm Appointment"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
