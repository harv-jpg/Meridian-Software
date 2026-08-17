"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="card w-full max-w-sm p-8"
      >
        <h1 className="text-xl font-semibold">Log in</h1>

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
          {status === "loading" ? "Logging in…" : "Log in"}
        </button>

        <p className="mt-3 text-center text-sm">
          <Link
            href="/forgot-password"
            className="font-medium text-slate-500 hover:text-ink"
          >
            Forgotten your password?
          </Link>
        </p>

        <p className="mt-4 text-center text-sm text-slate-500">
          No account yet?{" "}
          <Link href="/signup" className="font-medium text-ink underline">
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}
