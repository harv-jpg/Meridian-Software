import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ArchiveList from "./archive-list";
import type { ClientRecord } from "@/lib/types";

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
          it returns to the stage it was in.
        </p>
        <ArchiveList initialClients={(clients ?? []) as ClientRecord[]} />
      </div>
    </main>
  );
}
