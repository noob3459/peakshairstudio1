import { z } from "zod";

export const createAppointmentSchema = z.object({
  serviceId: z.string().min(1),
  stylistId: z.string().min(1),
  startAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid start time"),
  clientName: z.string().trim().min(1, "Name is required").max(200),
  clientEmail: z.string().trim().email("Enter a valid email"),
  clientPhone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(32)
    .regex(/^[0-9()+\-.\s]+$/, "Enter a valid phone number"),
  notes: z.string().trim().max(500).optional(),
  marketingOptIn: z.boolean().optional().default(false),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
