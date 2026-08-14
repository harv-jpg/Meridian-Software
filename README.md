# Setu

A CRM for freelancers and consultants: track deals through a pipeline, log
time against a client, raise invoices from that time, and get contracts
signed — in one place, without a per-seat enterprise tool.

Built with Next.js (App Router), Supabase (Postgres + Auth), TypeScript and
Tailwind.

## What's working

**Accounts** — email/password sign up and login via Supabase Auth. `/dashboard`
is protected; signed-out visitors are redirected to `/login`. Sessions are kept
alive by middleware, so login survives a page reload.

**Pipeline** — a kanban board across five stages (Lead → Proposal Sent →
Negotiating → Won/Lost). Cards are draggable between columns, and each column
shows its count and total value. A summary strip above the board gives pipeline
value, won value, win rate and a stage distribution bar.

**Follow-ups** — a client can carry a date you next intend to chase them. Once
that day arrives the card flags itself, and a counter beside the client total
filters the board down to only those, so "who haven't I chased" has an answer
without scanning five columns. It is a plain date the board reads — there is no
scheduler and nothing runs in the background.

**Client detail** — clicking a card opens a slide-over drawer, with the board
still visible behind it. The header carries the client's name, value and a stage
switcher; a summary strip shows tracked time, unbilled time, total invoiced and
total paid. Below that, four tabs:

- **Details** — company, email, phone, a follow-up date and free-text notes,
  edited together and saved as one form; the Save button enables only once
  something has changed
- **Time** — a live timer, or log minutes by hand; entries are marked `billed`
  once invoiced
- **Invoices** — generate from unbilled time at an hourly rate, or as a fixed
  fee; each gets a per-user invoice number and an optional due date, status
  moves draft → sent → paid, and overdue ones are flagged in red
- **Contracts** — write from a template, then share a signing link

**Contract signing** — `/sign/[token]` is a public page. The client opens the
link, types their name, and the contract is marked signed with a timestamp. They
need no account: the page reaches the contract through two `security definer`
Postgres functions that take the token as their only credential, so row-level
security can stay closed to anonymous users.

**Invoice sharing** — `/invoice/[token]` is the invoice equivalent of the
signing page: a public, read-only view the client can open without an account,
showing the amount, due date, issuer and paid/overdue status. It reaches the
invoice through the same `security definer` pattern, and deliberately refuses to
serve drafts — an unsent invoice stays invisible even to someone holding its
link.

**CSV import** — bring clients in from a spreadsheet or another CRM, mapping
your columns onto name, email, phone, company, value, stage and notes. The
importer guesses the likely column for each field from its header, so a typical
export needs little correcting by hand.

## Setting it up

**1. Create a Supabase project** at [supabase.com](https://supabase.com).

**2. Add your keys.** Copy `.env.local.example` to `.env.local` and fill in the
two values from your project's Settings → API:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

**3. Create the tables.** Paste `supabase/schema.sql` into the Supabase SQL
Editor and run it. It creates all four tables with their row-level security
policies, and is safe to re-run against a project that already has some of them.
It already includes the contact columns, invoice numbering and invoice sharing,
so a fresh project needs nothing from `supabase/migrations/`.

> **Upgrading a project created before those existed?** Run the files in
> `supabase/migrations/` in order instead. They alter tables that already hold
> data, which re-running `schema.sql` alone will not do — `create table if not
> exists` skips a table that is already there, new columns and all.

**4. Run it.**

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## How it fits together

```
src/
  middleware.ts              session refresh + /dashboard route guard
  lib/
    types.ts                 row types for the four tables, plus isOverdue
    stages.ts                pipeline stages and their colour classes
    format.ts                money, duration and date formatting
    supabase/                browser and server clients
  app/
    page.tsx                 landing
    login/  signup/          auth screens
    auth/callback/           Supabase auth redirect handler
    sign/[token]/            public contract signing
    invoice/[token]/         public read-only invoice view
    dashboard/
      page.tsx               server component; loads clients, renders shell
      dashboard-client.tsx   client-side state for the whole board
      pipeline-board.tsx     kanban columns, cards, drag and drop
      revenue-summary.tsx    headline figures + stage distribution
      client-detail-drawer.tsx  slide-over panel; loads all client records once
      details-tab.tsx  time-tab.tsx  invoices-tab.tsx  contracts-tab.tsx
      import-csv-modal.tsx
supabase/
  schema.sql                 full schema; run this on a new project
  migrations/                incremental upgrades for existing projects
```

The drawer fetches a client's time entries, invoices and contracts in a single
parallel load and passes them down, so switching sections is instant and the
figures stay consistent between them.

## Conventions worth knowing

**Money is stored as integer pence.** Never floats — `value_pence`,
`amount_pence`. Format it with the helpers in `src/lib/format.ts` rather than
inline, so thousands separators stay consistent.

**Tailwind class strings must appear literally in source.** Tailwind scans
files as text, so `bg-stage-${key}` will never be generated. That's why
`src/lib/stages.ts` writes every class out in full — and why `src/lib` is in the
`content` globs in `tailwind.config.ts`.

**Every table needs a policy for every verb the app uses.** With RLS enabled, an
operation with no matching policy does not error — it silently affects zero
rows. A missing `UPDATE` policy on `time_entries` once meant invoiced hours were
never marked as billed, so every subsequent invoice charged for them again, with
no error anywhere. If a write appears to succeed but nothing changes, check the
policies first.

## Known gaps

- **Invoices have no line items** — an invoice is still a single amount with a
  basis, so a bill assembled from several rates, or itemised for the client,
  can't be expressed.
- **Nothing sends an invoice.** Status moves to `sent` and a link can be copied,
  but the copying and sending are manual — there's no email step, and no
  reminder when one goes overdue.
- **Signing captures name and timestamp only** — no IP or user agent, which is
  the thin part of an e-signature's evidentiary value.
- **No tests, and no ESLint config file**, so `npm run lint` prompts for setup
  on first run.
- **No Stripe, and no AI features** — both were always planned to come after the
  core CRM worked.
