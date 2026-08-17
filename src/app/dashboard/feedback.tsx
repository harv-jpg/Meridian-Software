"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Replaces alert() and confirm(), which were used 29 times across the
 * dashboard. Both freeze the page, cannot be styled, and look identical to a
 * browser permissions prompt — including for the double-billing warning,
 * which is the most important message the app has.
 */

type Tone = "info" | "success" | "error";

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get a red button; everything else stays ink. */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

interface FeedbackApi {
  notify: (message: string, tone?: Tone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error("useFeedback must be used inside <FeedbackProvider>");
  }
  return ctx;
}

const TOAST_MS = 4200;

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const nextId = useRef(0);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const notify = useCallback((message: string, tone: Tone = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      TOAST_MS
    );
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  );

  function settle(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  // Escape cancels, and focus lands on the confirm button so the dialog is
  // operable from the keyboard alone.
  useEffect(() => {
    if (!pending) return;
    confirmRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        settle(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}

      {/* Toasts. aria-live so a screen reader announces them without the
          focus theft alert() caused. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex
                   flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-rise pointer-events-auto max-w-sm rounded-lg border
                        px-4 py-3 text-sm shadow-lift ${
                          t.tone === "error"
                            ? "border-red-200 bg-red-50 text-red-800"
                            : t.tone === "success"
                              ? "border-teal/40 bg-teal/10 text-teal"
                              : "border-ink/10 bg-white text-ink"
                        }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {pending && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 animate-fade-in bg-ink/40"
            onClick={() => settle(false)}
            aria-hidden="true"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="animate-rise relative w-full max-w-sm rounded-lg bg-white p-6 shadow-lift"
          >
            <h2 id="confirm-title" className="font-semibold">
              {pending.title}
            </h2>
            {pending.body && (
              <p className="mt-2 text-sm text-slate-500">{pending.body}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => settle(false)} className="btn-ghost">
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmRef}
                onClick={() => settle(true)}
                className={
                  pending.destructive
                    ? `inline-flex items-center justify-center rounded-md bg-red-600
                       px-4 py-2 text-sm font-semibold text-white transition
                       hover:bg-red-700 active:scale-[0.98]`
                    : "btn-primary"
                }
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
