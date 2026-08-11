"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="max-w-sm text-center text-slate-600">
          Check <strong>{email}</strong> for a confirmation link to finish
          creating your account.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded border border-ink/10 bg-white p-8"
      >
        <h1 className="text-xl font-semibold">Create your account</h1>

        <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded border border-ink/15 px-3 py-2 text-sm"
        />

        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Password
        </label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded border border-ink/15 px-3 py-2 text-sm"
        />

        {status === "error" && (
          <p className="mt-4 text-sm text-red-600">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={status === "loading"}
          className="mt-6 w-full rounded bg-ink py-2.5 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {status === "loading" ? "Creating account…" : "Sign up"}
        </button>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-ink underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
