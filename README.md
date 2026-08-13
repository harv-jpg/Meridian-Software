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

**Client detail** — clicking a card opens a slide-over drawer, with the board
still visible behind it. The header carries the client's name, value and a stage
switcher; a summary strip shows tracked time, unbilled time, total invoiced and
total paid. Below that, four sections:

- **Notes** — free text, with ⌘/Ctrl+Enter to save
- **Time** — a live timer, or log minutes by hand; entries are marked `billed`
  once invoiced
- **Invoices** — generate from unbilled time at an hourly rate, or as a fixed
  fee; status moves draft → sent → paid
- **Contracts** — write from a template, then share a signing link

**Contract signing** — `/sign/[token]` is a public page. The client opens the
link, types their name, and the contract is marked signed with a timestamp. They
need no account: the page reaches the contract through two `security definer`
Postgres functions that take the token as their only credential, so row-level
security can stay closed to anonymous users.

**CSV import** — bring clients in from a spreadsheet or another CRM, mapping
your columns onto name, value, stage and notes.

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

> The two contract-signing functions are **not** yet in that file — see
> [Known gaps](#known-gaps). A fresh project needs them added by hand before
> `/sign/[token]` will work.

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
    types.ts                 row types for the four tables
    stages.ts                pipeline stages and their colour classes
    format.ts                money, duration and date formatting
    supabase/                browser and server clients
  app/
    page.tsx                 landing
    login/  signup/          auth screens
    auth/callback/           Supabase auth redirect handler
    sign/[token]/
