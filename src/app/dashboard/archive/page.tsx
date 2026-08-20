import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ArchiveList from "./archive-list";
import type { ClientRecord } from "@/lib/types";
import type { AttachedCounts } from "@/lib/archive";

export default async function ArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  const archived = (clients ?? []) as ClientRecord[];
  const ids = archived.map((c) => c.id);

  // What deleting each one would take with it. Counted here rather than in the
  // list so the confirmation can name real numbers instead of warning vaguely
  // about "related records" — people agree to vague warnings without reading.
  const attached: Record<string, AttachedCounts> = {};
  if (ids.length > 0) {
    const [timeRes, invoiceRes, contractRes, emailRes] = await Promise.all([
      supabase.from("time_entries").select("client_id").in("client_id", ids),
      supabase.from("invoices").select("client_id").in("client_id", ids),
      supabase.from("contracts").select("client_id").in("client_id", ids),
      supabase.from("email_messages").select("client_id").in("client_id", ids),
    ]);

    for (const id of ids) {
      attached[id] = { time: 0, invoices: 0, contracts: 0, emails: 0 };
    }
    const bump = (
      rows: { client_id: string }[] | null,
      key: keyof AttachedCounts
    ) => {
      for (const row of rows ?? []) {
        if (attached[row.client_id]) attached[row.client_id][key] += 1;
      }
    };
    bump(timeRes.data, "time");
    bump(invoiceRes.data, "invoices");
    bump(contractRes.data, "contracts");
    bump(emailRes.data, "emails");
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink/10 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold leading-none tracking-tight">
              Archive
            </h1>
            <p className="mt-1 text-xs text-slate-400">{user.email}</p>
          </div>
          <Link href="/dashboard" className="btn-ghost">
            Back to pipeline
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="mb-6 text-sm text-slate-500">
          Archived clients are off the board but nothing has been deleted —
          their time, invoices and contracts are all still here. Restore one and
          it returns to the stage it was in. Deleting is permanent, and takes
          everything attached with it.
        </p>
        <ArchiveList initialClients={archived} attached={attached} />
      </div>
    </main>
  );
}
