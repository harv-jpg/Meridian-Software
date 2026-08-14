"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"checking" | "ready" | "saving" | "error" | "no-session">("checking");
  const [errorMsg, setErrorMsg] = useState("");

  const supabase = useMemo(() => createClient(), []);

  // Arriving here without a session means the link was never followed, or has
  // already expired — say so rather than showing a form that cannot work.
  useEffect(() => {
    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setStatus(user ? "ready" : "no-session");
    }
    check();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setErrorMsg(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Those two don't match.");
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-slate-500">Checking your link…</p>
      </main>
    );
  }

  if (status === "no-session") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="card w-full max-w-sm p-8 text-center">
          <h1 className="text-xl font-semibold">This link has expired</h1>
          <p className="mt-3 text-sm text-slate-500">
            Reset links last an hour. Ask for a fresh one and it will work.
          </p>
          <Link href="/forgot-password" className="btn-primary mt-6 w-full">
            Send a new link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold">Choose a new password</h1>

        <label className="label mt-6" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field mt-1"
        />

        <label className="label mt-4" htmlFor="confirm">
          Confirm it
        </label>
        <input
          id="confirm"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field mt-1"
        />

        {errorMsg && <p className="mt-4 text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={status === "saving"}
          className="btn-primary mt-6 w-full"
        >
          {status === "saving" ? "Saving…" : "Set password"}
        </button>
      </form>
    </main>
  );
}
