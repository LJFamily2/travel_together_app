/* eslint-disable @typescript-eslint/no-explicit-any */
type NotifyResult = { ok: boolean; status: number; error?: string };

// Debounce + retry state per journey
const pendingNotifies: Map<
  string,
  {
    timer?: NodeJS.Timeout;
    promise?: Promise<NotifyResult>;
    resolve?: (v: NotifyResult) => void;
    reject?: (e: any) => void;
    attempts: number;
  }
> = new Map();

const DEBOUNCE_MS = 1000; // coalesce calls within 1s
const MAX_RETRIES = 3;

export const notifyJourneyUpdate = (
  journeyId: string
): Promise<NotifyResult> => {
  const socketUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL || "http://127.0.0.1:4000";
  const socketSecret = process.env.SOCKET_SECRET;
  if (!socketSecret) {
    return Promise.reject(new Error("SOCKET_SECRET is not defined"));
  }

  const existing = pendingNotifies.get(journeyId);
  if (existing && existing.promise) {
    // Reset debounce timer so the grouped call is delayed
    if (existing.timer) clearTimeout(existing.timer);
    existing.timer = setTimeout(() => {
      sendNotify(journeyId);
    }, DEBOUNCE_MS);
    return existing.promise;
  }

  let resolveFn: (v: NotifyResult) => void;
  let rejectFn: (e: any) => void;
  const promise = new Promise<NotifyResult>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  pendingNotifies.set(journeyId, {
    attempts: 0,
    promise,
    resolve: resolveFn!,
    reject: rejectFn!,
    timer: setTimeout(() => sendNotify(journeyId), DEBOUNCE_MS),
  });

  return promise;

  async function sendNotify(jId: string) {
    const state = pendingNotifies.get(jId);
    if (!state) return;

    // clear any timer
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }

    state.attempts = (state.attempts || 0) + 1;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout per attempt

    try {
      const fetchFn = (globalThis as any).fetch;
      if (!fetchFn) throw new Error("fetch is not defined");
      const res = await fetchFn(`${socketUrl}/notify-update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": String(socketSecret),
        },
        body: JSON.stringify({ journeyId: jId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        // rate limit explicitly
        if (res.status === 429) {
          // if we have attempts left, back off and retry
          if (state.attempts <= MAX_RETRIES) {
            const backoff = 2 ** state.attempts * 250 + Math.random() * 100;
            setTimeout(() => sendNotify(jId), backoff);
            return;
          }
          state.resolve?.({ ok: false, status: 429 });
          pendingNotifies.delete(jId);
          state.reject?.(new Error("Too many requests"));
          return;
        }

        // other non-ok responses
        state.resolve?.({ ok: false, status: res.status });
        pendingNotifies.delete(jId);
        return;
      }

      // success
      state.resolve?.({ ok: true, status: res.status });
      pendingNotifies.delete(jId);
      return;
    } catch (err: any) {
      clearTimeout(timeoutId);
      // retry on network/abort errors up to MAX_RETRIES
      if (state.attempts <= MAX_RETRIES) {
        const backoff = 2 ** state.attempts * 250 + Math.random() * 100;
        setTimeout(() => sendNotify(jId), backoff);
        return;
      }

      console.warn(
        "Warning: Could not notify socket server (is it running?):",
        err?.message || err
      );
      state.resolve?.({ ok: false, status: 0, error: err?.message });
      pendingNotifies.delete(jId);
      return;
    }
  }
};

// Test helper to clear any pending timers and state
export const clearPendingNotifies = () => {
  for (const [jId, state] of pendingNotifies.entries()) {
    if (state.timer) {
      clearTimeout(state.timer);
    }
    // reject outstanding promises to avoid hanging tests
    try {
      state.reject?.(new Error("cleared"));
    } catch (e) {
      // ignore
    }
  }
  pendingNotifies.clear();
};
