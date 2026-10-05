import { randomBytes } from "node:crypto";
import { z } from "zod";

export const PASSWORD_ERROR =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a special character";

// GoTrue hashes with bcrypt, which only uses the first 72 bytes — reject
// anything longer rather than silently truncating what the admin typed.
export const passwordSchema = z
  .string()
  .min(8, PASSWORD_ERROR)
  .max(72, PASSWORD_ERROR)
  .refine((v) => /[a-z]/.test(v), PASSWORD_ERROR)
  .refine((v) => /[A-Z]/.test(v), PASSWORD_ERROR)
  .refine((v) => /[^A-Za-z0-9]/.test(v), PASSWORD_ERROR);

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SPECIAL = "!@#%&*";

function randomChar(alphabet: string): string {
  return alphabet[randomBytes(1)[0] % alphabet.length];
}

// Built to always satisfy passwordSchema (lower + upper + special, 8+ chars)
// rather than relying on chance across a mixed pool.
export function generatePassword(): string {
  const required = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SPECIAL)];
  const pool = LOWER + UPPER + DIGITS + SPECIAL;
  const rest = Array.from({ length: 12 }, () => randomChar(pool));
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle so the fixed-category chars aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
