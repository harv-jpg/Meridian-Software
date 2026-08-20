import Link from "next/link";
import { STAGES } from "@/lib/stages";

// Every claim here has to be true of the app as built. The pipeline card used
// to promise "drag a card to move it on", which the board itself contradicts
// on a phone — HTML5 drag-and-drop never fires on touch.
const FEATURES = [
  {
    title: "Pipeline",
    body: "Every deal on one board, from first conversation to won. Drag between columns on a desktop, or change stage with a tap on a phone.",
    accent: "bg-stage-lead",
  },
  {
    title: "Time",
    body: "Start a timer against a client, or log minutes after the fact. It stays attached to the work.",
    accent: "bg-stage-negotiating",
  },
  {
    title: "Invoices",
    body: "Bill tracked hours at your rate or raise a fixed fee, itemised, numbered and dated, with VAT if you're registered. Hours already invoiced can't be charged twice.",
    accent: "bg-stage-proposal",
  },
  {
    title: "Contracts",
    body: "Write from a template and send a signing link. Your client signs in a browser — no account needed.",
    accent: "bg-stage-won",
  },
  {
    title: "Getting paid",
    body: "Your client opens a real invoice: your details, their address, what it's for and how to pay. Anything past its due date is waiting for you when you open the app.",
    // Not bg-teal: that is the same hex as bg-stage-won on the Contracts card.
    accent: "bg-ink",
  },
  {
    title: "Nothing forgotten",
    body: "Put a date on a client and they resurface when it arrives. Overdue invoices sit alongside them, and any deal nobody has touched for three weeks flags itself — so one list answers what needs you today.",
    accent: "bg-stage-lost",
  },
  {
    title: "Your inbox",
    body: "Connect Gmail, Outlook, or your own domain's mailbox, and mail with a client files itself against them — no tagging, no BCC address. Subjects and dates only, never the message.",
    // Not bg-stage-lead: that is the Pipeline card's bar, two cards up.
    accent: "bg-sky",
  },
  {
    title: "Follow-ups, written",
    body: "Deals going quiet and invoices going late are drafted overnight, waiting when you open the app. Or ask for one on the spot. Either way it lands in a box you can edit — nothing sends without you.",
    // Its own colour: every other accent, `gold` included, is already a
    // stage colour on one of the cards above.
    accent: "bg-plum",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-sm font-bold text-paper">
              S
            </span>
            <span className="font-semibold tracking-tight">Setu</span>
          </div>
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-ink">
            Log in
          </Link>
        </header>

        <section className="py-16 text-center md:py-24">
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            The admin side of freelancing,
            <span className="text-teal"> in one place</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg text-slate-500">
            Track your deals, log your hours, invoice from them, and get
            contracts signed — without stitching four tools together or paying
            per seat for a sales CRM you don&rsquo;t need.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="btn-primary px-6 py-2.5">
              Create an account
            </Link>
            <Link href="/login" className="btn-ghost px-6 py-2.5">
              Log in
            </Link>
          </div>

          {/* The five pipeline stages, in the colours the board uses. */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {STAGES.map((s) => (
              <span
                key={s.key}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </span>
            ))}
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card relative overflow-hidden p-5 transition hover:shadow-lift"
            >
              <span
                className={`absolute inset-y-0 left-0 w-1 ${f.accent}`}
                aria-hidden="true"
              />
              <h2 className="pl-2 font-semibold">{f.title}</h2>
              <p className="mt-1.5 pl-2 text-sm leading-relaxed text-slate-500">
                {f.body}
              </p>
            </div>
          ))}
        </section>

        <footer className="border-t border-ink/10 py-6 text-center text-xs text-slate-400">
          Setu — a CRM for freelancers and consultants.
        </footer>
      </div>
    </main>
  );
}
