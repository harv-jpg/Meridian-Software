"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold">Reset your password</h1>

        {status === "sent" ? (
          // Deliberately the same message whether or not the address has an
          // account — otherwise this page tells a stranger who is registered.
          <>
            <p className="mt-4 text-sm text-slate-600">
              If an account exists for <strong>{email}</strong>, a reset link is
              on its way. It expires after an hour.
            </p>
            <Link href="/login" className="btn-ghost mt-6 w-full">
              Back to log in
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="mt-2 text-sm text-slate-500">
              We&rsquo;ll email you a link to choose a new one.
            </p>

            <label className="label mt-6" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field mt-1"
            />

            {status === "error" && (
              <p className="mt-4 text-sm text-red-600">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="btn-primary mt-6 w-full"
            >
              {status === "loading" ? "Sending…" : "Send reset link"}
            </button>

            <p className="mt-4 text-center text-sm text-slate-500">
              Remembered it?{" "}
              <Link href="/login" className="font-medium text-ink underline">
                Log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
