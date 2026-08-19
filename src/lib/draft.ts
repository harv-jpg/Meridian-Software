/**
 * Client-side wrapper around POST /api/draft.
 *
 * Same shape as `sendByEmail`: a 501 means the feature is not set up on this
 * deployment, which callers treat as a state rather than a failure — the
 * button is hidden instead of erroring.
 */
export interface Draft {
  subject: string;
  body: string;
  /** One line naming the fact the draft is built on. For the sender only. */
  angle: string;
}

export interface DraftResult {
  draft?: Draft;
  configured: boolean;
  error?: string;
}

export async function draftFollowUp(clientId: string): Promise<DraftResult> {
  try {
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const data = (await res.json()) as { draft?: Draft; error?: string };

    if (res.status === 501) {
      return { configured: false, error: data.error };
    }
    if (!res.ok || !data.draft) {
      return {
        configured: true,
        error: data.error ?? "Could not write a draft.",
      };
    }
    return { configured: true, draft: data.draft };
  } catch {
    return {
      configured: true,
      error: "Could not reach the server. Check your connection.",
    };
  }
}
