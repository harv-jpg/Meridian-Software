import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./settings-form";
import InboxCard from "./inbox-card";
import type { BusinessProfile, EmailConnection } from "@/lib/types";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ inbox?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: connection }, params] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    // Through the function, not the table: `email_accounts` has no select
    // policy, so this is the only view of it that exists outside the server.
    supabase.rpc("get_email_connection").maybeSingle(),
    searchParams,
  ]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink/10 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold leading-none tracking-tight">
              Business details
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
          These appear on every invoice you send. Without them an invoice is a
          statement of an amount; with them it is a document your client&rsquo;s
          bookkeeper can file.
        </p>
        <SettingsForm
          userId={user.id}
          initialProfile={(profile ?? null) as BusinessProfile | null}
        />
        <InboxCard
          userId={user.id}
          connection={(connection ?? null) as EmailConnection | null}
          outcome={params.inbox}
        />
      </div>
    </main>
  );
}
