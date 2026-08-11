import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <LogoutButton />
        </div>

        <p className="mt-2 text-slate-500">Signed in as {user.email}</p>

        <div className="mt-10 rounded border border-dashed border-ink/20 p-8 text-center text-slate-500">
          This is where the pipeline (Lead → Proposal → Negotiating → Won)
          and contact list get built next. Auth is fully working — the next
          step is a <code>clients</code> table in Supabase and a kanban view
          reading from it.
        </div>
      </div>
    </main>
  );
}
