# Setu — app starter

This is the first real piece of the Meridian product: a working Next.js app
with Supabase authentication (sign up, log in, log out, a protected
dashboard) already wired up. It's a starting point, not a finished product —
the pipeline/contacts/AI features get built from here.

## What's already working

- Email/password sign up and login (Supabase Auth)
- A protected `/dashboard` route — signed-out users get redirected to `/login`
- Session handling via middleware, so login persists across page loads
- Tailwind CSS set up with Meridian's colors (ink navy, paper, teal)
- A SQL migration (`supabase/schema.sql`) for the first real table: `clients`
  — the pipeline records (Lead → Proposal Sent → Negotiating → Won/Lost)

## What's NOT built yet (on purpose — this is the starter)

- The actual kanban pipeline UI
- Contact timeline
- Contracts, time tracking, invoicing
- Any AI features (those come last — see the build order below)

## Suggested build order from here

1. **Pipeline UI** — a kanban board on `/dashboard` reading from the
   `clients` table (drag between Lead / Proposal Sent / Negotiating / Won).
2. **Contact detail page** — click a client, see/add notes.
3. **Contracts, time tracking, invoicing** — mostly CRUD screens against new
   tables, similar pattern to `clients`.
4. **Stripe** — add subscriptions once there's something worth paying for.
5. **AI features last** — auto-logging, draft assistant, meeting-to-notes,
   deal-risk flags.

This is a good project to hand to Claude Code — open this folder and ask it
to build the kanban pipeline next.
