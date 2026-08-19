import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";
import DashboardClient from "./dashboard-client";
import type { ClientRecord, Invoice, Nudge } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Invoices are loaded here as well as in the drawer, because the attention
  // strip needs to know what is overdue before any client is opened.
  const [{ data: clients }, { data: invoices }, { data: profile }, { data: nudges }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("invoices").select("*").order("due_date", { ascending: true }),
      supabase
        .from("business_profiles")
        .select("default_vat_rate_bp")
        .eq("user_id", user.id)
        .maybeSingle(),
      // Written overnight, if the scheduled job is configured. Without it this
      // is simply always empty and the strip never appears.
      supabase
        .from("nudges")
        .select("*")
        .eq("status", "waiting")
        .order("created_at", { ascending: false }),
    ]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink/10 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-sm font-bold text-paper">
              S
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-none tracking-tight">
                Pipeline
              </h1>
              <p className="mt-1 text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/archive" className="btn-ghost">
              Archive
            </Link>
            <Link href="/dashboard/settings" className="btn-ghost">
              Business details
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <DashboardClient
          initialClients={(clients ?? []) as ClientRecord[]}
          initialInvoices={(invoices ?? []) as Invoice[]}
          initialNudges={(nudges ?? []) as Nudge[]}
          defaultVatRateBp={profile?.default_vat_rate_bp ?? 0}
          userId={user.id}
        />
      </div>
    </main>
  );
}
