# Setu

A CRM for freelancers and consultants: track deals through a pipeline, log
time against a client, raise invoices from that time, and get contracts
signed — in one place, without a per-seat enterprise tool.

Built with Next.js (App Router), Supabase (Postgres + Auth), TypeScript and
Tailwind.

## What's working

**Accounts** — email/password sign up, login and password reset via Supabase
Auth. `/dashboard`
is protected; signed-out visitors are redirected to `/login`. Sessions are kept
alive by middleware, so login survives a page reload.

**Pipeline** — a kanban board across five stages (Lead → Proposal Sent →
Negotiating → Won/Lost). Cards are draggable between columns on a pointer
device — HTML5 drag-and-drop never fires on touch, so on a phone you change
stage from inside the client panel instead, and the board says so. Each column
shows its count and total value. A summary strip above the board gives pipeline
value, won value, win rate and a stage distribution bar.

**Needs attention** — the first thing on the dashboard: overdue invoices, due
follow-ups and deals that have gone quiet in one list, each opening the client
it belongs to, with the total outstanding past its due date along the bottom.
It hides itself when there is nothing to do.

**Quiet deals** — an open deal nobody has touched for three weeks is flagged on
its card and listed in Needs attention, longest silence first. "Touched" means
a write to the client row or an invoice raised against them; logging time is
not counted, because the board would have to load every time entry to find out,
so the flag errs towards saying a client is quieter than they are. A client
with a follow-up date is never flagged — you have already decided when to chase
them, and Follow-ups raises it on the day.

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
  fee; each gets a per-user invoice number, an optional due date, VAT at your
  configured rate and line items you can add to while it is still a draft.
  Status moves draft → sent → paid, and overdue ones are flagged in red
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

**Sending** — with an email provider configured, invoices and contracts can be
emailed to the client straight from the drawer, with the share link embedded
and replies going to your own address. Without one the buttons say so and you
copy the link instead — nothing else changes.

**Drafting a follow-up** — with `ANTHROPIC_API_KEY` set, the Details tab can
write a follow-up email to that client. What goes to the model is one client's
own records and nothing else: their stage, value, your private notes on them,
their unbilled work, unpaid and overdue invoices, and any contract sent but not
signed. It is told to write only from that and to invent nothing. What comes
back is a subject and a body in editable boxes, plus one line naming the fact
the draft leans on. **Nothing is sent.** You copy it, or open it in your own
mail client with the send button still unpressed. Without the key the panel
says it isn't set up and nothing else changes.

It writes from the record, not in your voice — matching how you actually write
would mean reading your sent mail, which this app has no access to.

**Business details** — your name, address, VAT number and rate, how to pay you
and an invoice footer, set once at `/dashboard/settings` and applied to every
invoice. Without them an invoice states an amount; with them it is a document a
bookkeeper can file.

**Archiving** — finishing with a client archives them rather than deleting.
They leave the board and their time, invoices and contracts are kept; the
Archive page lists them and restores one to the stage it left. Permanent
deletion stays available only while a client has none of those attached, since
the cascade would otherwise destroy records you are expected to keep.

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

Two optional keys, both listed in `.env.local.example`. `RESEND_API_KEY` and
`EMAIL_FROM` turn on email; `ANTHROPIC_API_KEY` turns on follow-up drafting.
Everything else works without any of them, and the features that need them say
so in place rather than failing.

**Checks.** `npm test` runs the unit tests, `npm run lint` the linter, and
`npm run build` type-checks as it compiles.

Then open http://localhost:3000.

## How it fits together

```
src/
  middleware.ts              session refresh + /dashboard route guard
  lib/
    types.ts                 row types, plus isOverdue and the quiet-deal rules
    stages.ts                pipeline stages and their colour classes
    format.ts                money, duration and date formatting
    invoice.ts               line-item totals; mirrors the database trigger
    send.ts                  client wrapper around the email route
    draft.ts                 client wrapper around the drafting route
    supabase/                browser and server clients
  app/
    page.tsx                 landing
    login/  signup/          auth screens
    forgot-password/         request a reset link
    reset-password/          choose a new password
    auth/callback/           Supabase auth redirect handler
    api/send/                emails an invoice or contract to the client
    api/draft/               writes a follow-up email from one client's records
    sign/[token]/            public contract signing
    invoice/[token]/         public read-only invoice view
    dashboard/
      page.tsx               server component; loads clients, renders shell
      dashboard-client.tsx   client-side state for the whole board
      pipeline-board.tsx     kanban columns, cards, drag and drop
      revenue-summary.tsx    headline figures + stage distribution
      client-detail-drawer.tsx  slide-over panel; loads all client records once
      details-tab.tsx  time-tab.tsx  invoices-tab.tsx  contracts-tab.tsx
      needs-attention.tsx      overdue invoices, due follow-ups, quiet deals
      follow-up-draft.tsx      the drafting panel inside a client
      feedback.tsx             toasts and confirmations
      archive/                 archived clients, and restoring them
      settings/                your business details, VAT and payment info
      import-csv-modal.tsx
supabase/
  schema.sql                 full schema; run this on a new project
  migrations/                incremental upgrades for existing projects
```

The drawer fetches a client's time entries, invoices and contracts in a single
parallel load and passes them down, so switching sections is instant and the
figures stay consistent between them.

## Conventions worth knowing

**VAT is derived, never stored.** `invoices.amount_pence` is the net total of
the line items and `vat_rate_bp` the rate in basis points (2000 = 20%). Tax and
gross are computed from those two by `src/lib/invoice.ts`, so a third column
cannot fall out of step with the other two.

**No native browser dialogs.** `alert()` and `confirm()` freeze the page, cannot
be styled, and look identical to a browser permissions prompt. Use `notify` and
`confirm` from `useFeedback()` instead. The two surviving `window.prompt` calls
are deliberate: they are the fallback when the Clipboard API is unavailable,
where selectable text beats a toast.

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

- **No export.** Your records exist only inside Supabase; an accountant will
  want a CSV, and so will you at tax time.
- **No reminders.** Overdue invoices and due follow-ups are surfaced when you
  open the app, but nothing chases them on your behalf — there is no scheduler
  and nothing runs in the background.
- **Only unit tests.** The pure logic is covered; nothing exercises the
  components or the database policies, which is where the costlier bugs have
  been.
- **Signing captures name and timestamp only** — no IP or user agent, which is
  the thin part of an e-signature's evidentiary value.
- **No Stripe, and no AI features** — both were always planned to come after the
  core CRM worked.
