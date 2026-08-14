/**
 * Client-side wrapper around POST /api/send.
 *
 * The route answers 501 when no provider is configured, which is not an
 * error so much as a state — callers use `configured: false` to fall back to
 * copying a link rather than showing a failure.
 */
export interface SendResult {
  sent: boolean;
  configured: boolean;
  to?: string;
  error?: string;
}

export async function sendByEmail(
  kind: "invoice" | "contract",
  id: string
): Promise<SendResult> {
  try {
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    const data = (await res.json()) as { to?: string; error?: string };

    if (res.status === 501) {
      return { sent: false, configured: false, error: data.error };
    }
    if (!res.ok) {
      return { sent: false, configured: true, error: data.error ?? "Could not send." };
    }
    return { sent: true, configured: true, to: data.to };
  } catch {
    return {
      sent: false,
      configured: true,
      error: "Could not reach the server. Check your connection.",
    };
  }
}
