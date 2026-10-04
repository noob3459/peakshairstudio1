# Peaks Hair Studio — Booking App

A Next.js app that adds real online booking and a staff admin area alongside
the existing static marketing site. The 7 existing pages (`../index.html`,
`../services.html`, etc.) are served unchanged from `public/` as plain HTML;
this app adds `/book` (public booking flow) and `/staff` (protected dashboard)
on top, backed by **Supabase** (Postgres + Auth).

**This app is now connected to a real, live Supabase project** (not a local
test database) — see "Current status" below.

## Staff roles

Four accounts, each signing in at `/staff/login` with just their first name
and their own password — no public sign-up, no shared login.

| Username | Person | Access level (shown in the UI as) |
|---|---|---|
| `reyna` | Reyna Barnes, owner | **Owner** — views/edits every stylist's availability, resets Isabel's/Brandon's passwords, edits her own contact info, and can submit site-change proposals. Cannot see or act on the developer account at all. |
| `isabel` | Isabel | **Stylist** — her own availability and contact info only. |
| `brandon` | Brandon | **Stylist** — his own availability and contact info only. |
| `aidenn` | Aidenn, the developer | **Developer** — everything: every stylist's availability, all appointments, full user management (including the owner's password), and reviews/exports Reyna's proposed changes. Not a bookable stylist (hidden from the public site). |

Enforced **server-side** on every request (see `lib/currentStylist.ts`,
`resolveTargetStylist()`) — never just hidden in the UI. A stylist's request
naming another stylist's id is silently redirected back to their own; a
manager's (Reyna's) request naming the dev account is likewise redirected
back to her own — she structurally cannot reach Aidenn's account or see it
listed anywhere, including the Users page.

## What's here vs. what's untouched

- **Untouched**: the original `index.html`, `services.html`, `team.html`,
  `story.html`, `grand-opening.html`, `join-the-team.html`, `visit.html`,
  `css/`, `js/`, `images/` one level up, in the project root. Nothing there
  was edited.
- **New copies, with small additive edits**: the same 7 pages live again
  inside `booking-app/public/` (Next.js can only serve static files from
  inside its own `public/` folder) — each got a "Book Now" header button, a
  small "Staff Sign In" link, and (`team.html` only) a "Book with
  [Stylist]" link per bio, plus a small script that fills in each stylist's
  live-edited Instagram/Facebook/phone/email from `/api/stylists` (falling
  back to the static text already there if that fetch fails). Subtle
  load-in, scroll-reveal, and heading-shine animations were also added (see
  `css/styles.css`, respects `prefers-reduced-motion`). No other content
  changed. Once this app is the thing actually deployed, the root-level
  originals become redundant — that cleanup is a separate, later,
  explicitly-approved step (not done as part of this change).
- **Fully new**: `/book`, `/staff/login`, `/staff` (appointments),
  `/staff/availability`, `/staff/users`, `/staff/proposals`, and every route
  under `app/api/`.

## Environment variables

`.env.local` (gitignored) currently holds the real project's values — see
`.env.example` for the shape without real values. Never commit `.env.local`.

| Variable | Where to get it | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API | Yes (by design — public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page | Yes (by design — public, RLS-limited) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, "service_role" | **No — server-only, secret** |
| `DATABASE_URL` | Settings → Database → Connection string | **No — server-only, secret** |
| `RESEND_API_KEY` | resend.com → API Keys | **No — server-only, secret** |
| `EMAIL_FROM` | An address on a domain you've verified with Resend | No (used server-side only) |

Only `NEXT_PUBLIC_*` variables ever reach the browser bundle; everything else
is read exclusively in API routes, Server Components, or the proxy
(middleware) — see `lib/supabase/admin.ts`, `lib/db/client.ts`, `lib/email.ts`.

**`DATABASE_URL` is currently the direct connection** (port 5432). Switch to
the **Transaction pooler** string (port 6543, same Settings → Database page)
before deploying to a serverless platform, to avoid exhausting connections.

## Current status

- Schema, RLS, and all migrations are applied to the real project.
- Real stylists/services are seeded (durations/prices still unset — see
  "Owner decisions"). **No availability is seeded** — each stylist is
  unbookable until they explicitly set dates via `/staff/availability`.
- All four staff accounts exist and were each individually verified to sign
  in successfully against the real Supabase Auth endpoint. Passwords were
  relayed once in chat when created — treat them as already potentially
  exposed; changing them via the Users page (or `scripts/create-staff-admins.ts`)
  is reasonable if that's a concern.
- `RESEND_API_KEY`/`EMAIL_FROM` are still unset — bookings work, but
  confirmation emails log as `skipped_no_provider` instead of sending.
- Nothing is deployed publicly. This is still a local dev server
  (`npm run dev`) pointed at the real database.

## One-time setup, for reference (already done once above)

1. Create a Supabase project.
2. Run the migrations in order (Supabase SQL editor or `supabase db push`):
   everything in `booking-app/supabase/migrations/`, in filename order.
3. `npx tsx scripts/seed.ts` — real stylists/services, placeholder hours.
4. `npx tsx scripts/create-staff-admins.ts` — all four accounts at once
   (resets everyone's password — see below for doing just one).
5. Set up Resend, verify a domain, set `EMAIL_FROM`.
6. Deploy; set every env var above in the host's settings, never in a file.

### Adding or resetting just one account

```
npx tsx scripts/create-staff-admins.ts aidenn
```

Pass one or more usernames to touch only those accounts — useful for adding
a new hire later, or resetting one person's password without regenerating
everyone else's. Omit arguments to do all four at once. The staff Users page
(`/staff/users`, owner or developer only) can also reset one person's
password without touching the terminal at all.

## Proposed site changes (Reyna only)

`/staff/proposals` is Reyna's one-way inbox to Aidenn: she picks which public
page a change concerns and describes it in free text; it's saved to the
`proposed_changes` table. **Nothing here ever edits the live site
automatically** — it's a suggestion queue, not a CMS. Aidenn's view of the
same page shows everyone's submissions (just Reyna's, today), with Copy,
"Export .txt", and mark-resolved/reopen controls, matching the
"review once a month/quarter" workflow. Reyna can retract her own still-open
submissions; Aidenn can delete any.

## Self-service contact info

Each stylist's own `/staff/availability` page has a "Contact & social"
section (Instagram, Facebook, phone, email — all optional except Instagram
isn't required either) that only they can edit for themselves (`PATCH
/api/admin/stylists/[id]` rejects a contact-field edit targeting anyone but
your own row, unless you're the dev account). Saved values are reflected on
the public `team.html` page automatically via a small client-side fetch to
`/api/stylists` — see "What's here" above.

## Local development

```
npm install
cp .env.example .env.local        # or use the real values already in place
npx drizzle-kit migrate           # applies booking-app/drizzle/*.sql to DATABASE_URL
npm run dev
```

## What was actually verified in this environment, and what wasn't

Verified directly, against the real Supabase project:

- **Double-booking protection under real concurrency** (tested earlier
  against an equivalent local database before this project existed, same
  schema/constraint): two simultaneous requests for the identical
  stylist+slot — exactly one succeeded, the other got a clean "slot just
  booked" 409, backed by the `UNIQUE(stylist_id, start_at)` constraint.
- **All four accounts can really sign in** — called the real Supabase Auth
  token endpoint with each one's actual username→email mapping and password,
  got back a valid session whose subject matches that person's linked
  stylist row.
- **Staff routes/API deny access with no session** (`/staff`, `/staff/users`,
  `/staff/proposals` all redirect; `/api/admin/*` returns 401) — confirmed
  directly, no cookie present.
- **The full role matrix**, run against the real database with the real
  linked account ids: Reyna is `manager`, Isabel/Brandon are `stylist`,
  Aidenn is `dev` and inactive (hidden from the public site); a stylist
  requesting another stylist's schedule is redirected to their own; a
  manager can reach another stylist's schedule but is redirected to her own
  when targeting the dev account; the dev account can reach anyone. Also
  confirmed the Users-list query a manager sees structurally excludes any
  dev-role row — Reyna's query for staff never returns Aidenn.
- `npm run build` and `npx eslint .` are both clean (0 errors).

**Not verified here** (needs manual click-through, or real email
credentials): the actual browser UI flows (login form, availability editor,
proposals form, Users page reset-password button) end-to-end by clicking
through them — I don't have a browser automation tool in this environment,
so these were opened for the user to check rather than clicked through by
me. Real email delivery through Resend (no API key configured yet).

## Owner decisions still needed before bookings go live

1. **Each stylist's real schedule.** Nothing is seeded — a stylist is not
   bookable at all until they add dates at `/staff/availability`, either by
   picking individual dates on the calendar (up to a year ahead) or by
   generating a recurring weekday pattern for a set number of weeks.
2. **Service durations and prices.** All seeded services have `null` for
   both; the booking page shows "Contact the salon to confirm" until set.
   No admin UI for this yet (direct database edit, or ask for a small form
   to be added).
3. **Deposits.** Not implemented. If wanted: pick a payment provider,
   amount, and refund/cancellation rules first — built as a separate change
   using that provider's hosted checkout, never storing card data here.
4. **Cancellation/rescheduling policy wording** for the confirmation email —
   currently generic.
5. **A domain you control**, to verify with Resend so confirmation emails
   actually send.
6. **Suite 130 and the published hours** — carried over as still-unconfirmed
   from the earlier static-site work (see `../README.md`).
7. The "-clean.png" team photos referenced by the static site (noted, not
   touched by this change) — separate decision from booking.
8. **Whether appointment visibility should also be split per stylist** —
   currently everyone with admin access sees every appointment; only
   *availability* and *proposals* are role-scoped, per the brief.
