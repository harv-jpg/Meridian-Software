import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";
import DashboardClient from "./dashboard-client";
import type { ClientRecord } from "@/lib/types";

export default async function DashboardPage() {
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
    .order("created_at", { ascending: false });

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
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <DashboardClient
          initialClients={(clients ?? []) as ClientRecord[]}
          userId={user.id}
        />
      </div>
    </main>
  );
}
