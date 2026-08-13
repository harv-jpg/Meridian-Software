import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold">Setu</h1>
      <p className="max-w-sm text-slate-500">
        This is the starter shell. Sign in or create an account to reach the
        dashboard — everything else gets built from here.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded bg-ink px-5 py-2.5 text-sm font-semibold text-paper"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded border border-ink/20 px-5 py-2.5 text-sm font-semibold"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
