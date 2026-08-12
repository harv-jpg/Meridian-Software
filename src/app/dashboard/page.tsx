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
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <LogoutButton />
        </div>

        <p className="mt-2 text-slate-500">Signed in as {user.email}</p>

        <div className="mt-8">
          <DashboardClient
            initialClients={(clients ?? []) as ClientRecord[]}
            userId={user.id}
          />
        </div>
      </div>
    </main>
  );
}
