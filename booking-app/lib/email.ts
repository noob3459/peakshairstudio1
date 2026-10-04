import { Resend } from "resend";
import { randomUUID } from "node:crypto";
import { db } from "./db/client";
import { emailLog } from "./db/schema";

const SALON_NAME = "Peaks Hair Studio";
const SALON_PHONE = "760-449-6456";
const SALON_EMAIL = "peakshairstudio@gmail.com";
// Reported address — carried over as unconfirmed, same as the public site's README.
const SALON_ADDRESS = "15940 Quantico Rd, Suite 130, Apple Valley, CA 92307 (subject to owner confirmation)";

type BookingEmailInput = {
  appointmentId: string;
  confirmationCode: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  serviceName: string;
  stylistName: string;
  localDateLabel: string;
  localTimeLabel: string;
  notes?: string | null;
};

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function logResult(
  appointmentId: string,
  recipient: string,
  kind: "client_confirmation" | "salon_notification",
  status: "sent" | "failed" | "skipped_no_provider",
  error?: string,
) {
  await db.insert(emailLog).values({
    id: randomUUID(),
    appointmentId,
    recipient,
    kind,
    status,
    error: error ?? null,
  });
}

function clientConfirmationHtml(b: BookingEmailInput): string {
  return `
    <div style="font-family: Georgia, serif; color:#362520; max-width:520px; margin:0 auto;">
      <h1 style="font-size:1.4rem;">${SALON_NAME}</h1>
      <p>Hi ${escapeHtml(b.clientName)}, your appointment is confirmed.</p>
      <table style="width:100%; border-collapse:collapse; margin:1rem 0;">
        <tr><td style="padding:4px 0; color:#6b5b52;">Service</td><td style="padding:4px 0;">${escapeHtml(b.serviceName)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Stylist</td><td style="padding:4px 0;">${escapeHtml(b.stylistName)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Date</td><td style="padding:4px 0;">${escapeHtml(b.localDateLabel)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Time</td><td style="padding:4px 0;">${escapeHtml(b.localTimeLabel)} (Apple Valley, CA local time)</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Confirmation #</td><td style="padding:4px 0;">${escapeHtml(b.confirmationCode)}</td></tr>
      </table>
      <p>${SALON_ADDRESS}</p>
      <p>To cancel or reschedule, call us at ${SALON_PHONE} or email ${SALON_EMAIL} and reference your confirmation number. (Final cancellation/rescheduling policy pending owner approval.)</p>
      <p style="color:#6b5b52; font-size:0.85rem;">Where comfort meets luxury&hellip; Nestled within the Apple Valley mountains in our little corner of the desert.</p>
    </div>
  `;
}

function salonNotificationHtml(b: BookingEmailInput): string {
  return `
    <div style="font-family: sans-serif; color:#362520; max-width:520px; margin:0 auto;">
      <h1 style="font-size:1.2rem;">New booking: ${escapeHtml(b.serviceName)} with ${escapeHtml(b.stylistName)}</h1>
      <table style="width:100%; border-collapse:collapse; margin:1rem 0;">
        <tr><td style="padding:4px 0; color:#6b5b52;">Client</td><td style="padding:4px 0;">${escapeHtml(b.clientName)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Email</td><td style="padding:4px 0;">${escapeHtml(b.clientEmail)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Phone</td><td style="padding:4px 0;">${escapeHtml(b.clientPhone)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Date</td><td style="padding:4px 0;">${escapeHtml(b.localDateLabel)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Time</td><td style="padding:4px 0;">${escapeHtml(b.localTimeLabel)}</td></tr>
        ${b.notes ? `<tr><td style="padding:4px 0; color:#6b5b52;">Notes</td><td style="padding:4px 0;">${escapeHtml(b.notes)}</td></tr>` : ""}
        <tr><td style="padding:4px 0; color:#6b5b52;">Confirmation #</td><td style="padding:4px 0;">${escapeHtml(b.confirmationCode)}</td></tr>
      </table>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Sends both the client confirmation and the salon notification. Never throws —
 * a delivery failure is logged to email_log for admin review and does not block
 * the booking from succeeding or the client from seeing an on-screen confirmation.
 * Returns which sends actually succeeded, so callers can be honest with the client
 * ("we also emailed you a confirmation" vs. staying silent about email status).
 */
export async function sendBookingEmails(
  input: BookingEmailInput,
): Promise<{ clientSent: boolean; salonSent: boolean }> {
  const resend = getClient();
  const fromAddress = process.env.EMAIL_FROM;

  if (!resend || !fromAddress) {
    // No provider configured in this environment — log instead of pretending to send.
    await logResult(input.appointmentId, input.clientEmail, "client_confirmation", "skipped_no_provider");
    await logResult(input.appointmentId, SALON_EMAIL, "salon_notification", "skipped_no_provider");
    return { clientSent: false, salonSent: false };
  }

  let clientSent = false;
  let salonSent = false;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: input.clientEmail,
      subject: `Your appointment at ${SALON_NAME} is confirmed`,
      html: clientConfirmationHtml(input),
    });
    if (error) throw new Error(error.message);
    clientSent = true;
    await logResult(input.appointmentId, input.clientEmail, "client_confirmation", "sent");
  } catch (err) {
    await logResult(
      input.appointmentId,
      input.clientEmail,
      "client_confirmation",
      "failed",
      err instanceof Error ? err.message : String(err),
    );
  }

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: SALON_EMAIL,
      subject: `New booking: ${input.serviceName} — ${input.localDateLabel} ${input.localTimeLabel}`,
      html: salonNotificationHtml(input),
    });
    if (error) throw new Error(error.message);
    salonSent = true;
    await logResult(input.appointmentId, SALON_EMAIL, "salon_notification", "sent");
  } catch (err) {
    await logResult(
      input.appointmentId,
      SALON_EMAIL,
      "salon_notification",
      "failed",
      err instanceof Error ? err.message : String(err),
    );
  }

  return { clientSent, salonSent };
}

type AppointmentUpdateInput = {
  appointmentId: string;
  confirmationCode: string;
  clientEmail: string;
  clientName: string;
  serviceName: string;
  stylistName: string;
  localDateLabel: string;
  localTimeLabel: string;
  action: "confirmed" | "cancelled" | "rescheduled";
};

/** Notifies the client when the owner confirms, cancels, or reschedules their appointment. */
export async function sendAppointmentUpdateEmail(input: AppointmentUpdateInput): Promise<boolean> {
  const resend = getClient();
  const fromAddress = process.env.EMAIL_FROM;
  if (!resend || !fromAddress) {
    await logResult(input.appointmentId, input.clientEmail, "client_confirmation", "skipped_no_provider");
    return false;
  }

  const subjectByAction: Record<AppointmentUpdateInput["action"], string> = {
    confirmed: `Your appointment at ${SALON_NAME} is confirmed`,
    cancelled: `Your appointment at ${SALON_NAME} has been cancelled`,
    rescheduled: `Your appointment at ${SALON_NAME} has been rescheduled`,
  };

  const html = `
    <div style="font-family: Georgia, serif; color:#362520; max-width:520px; margin:0 auto;">
      <h1 style="font-size:1.3rem;">${subjectByAction[input.action]}</h1>
      <p>Hi ${escapeHtml(input.clientName)},</p>
      <table style="width:100%; border-collapse:collapse; margin:1rem 0;">
        <tr><td style="padding:4px 0; color:#6b5b52;">Service</td><td style="padding:4px 0;">${escapeHtml(input.serviceName)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Stylist</td><td style="padding:4px 0;">${escapeHtml(input.stylistName)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Date</td><td style="padding:4px 0;">${escapeHtml(input.localDateLabel)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Time</td><td style="padding:4px 0;">${escapeHtml(input.localTimeLabel)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b5b52;">Confirmation #</td><td style="padding:4px 0;">${escapeHtml(input.confirmationCode)}</td></tr>
      </table>
      <p>Questions? Call ${SALON_PHONE} or email ${SALON_EMAIL}.</p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: input.clientEmail,
      subject: subjectByAction[input.action],
      html,
    });
    if (error) throw new Error(error.message);
    await logResult(input.appointmentId, input.clientEmail, "client_confirmation", "sent");
    return true;
  } catch (err) {
    await logResult(
      input.appointmentId,
      input.clientEmail,
      "client_confirmation",
      "failed",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}
