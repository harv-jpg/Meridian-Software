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
        className="card w-full max-w-sm p-8"
      >
        <h1 className="text-xl font-semibold">Create your account</h1>

        <label className="label mt-6">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field mt-1"
        />

        <label className="label mt-4">
          Password
        </label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
