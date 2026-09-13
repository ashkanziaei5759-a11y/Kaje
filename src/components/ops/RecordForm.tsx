'use client';

import { useState, type ReactNode, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The shell every data-entry screen in the panel shares.
 *
 * It exists because the failure modes are identical everywhere and were worth
 * solving once: a double-submitted form that books the same invoice twice, a
 * server error that vanishes silently, a save that appears to do nothing
 * because the list behind it still shows stale numbers.
 *
 * So: the button disables while in flight, the server's own message is shown
 * verbatim rather than replaced by a generic one, success states what actually
 * happened in the restaurant's terms, and router.refresh() re-reads the page so
 * the totals underneath move at the same moment.
 */
export function RecordForm<T>({
  title,
  explain,
  submitLabel,
  endpoint,
  buildBody,
  onSuccess,
  describeSuccess,
  children,
  disabled,
}: {
  title: string;
  /** What this screen is for and what saving will change. Always shown. */
  explain: ReactNode;
  submitLabel: string;
  endpoint: string;
  /** Returns the request body, or a message explaining why it cannot be built. */
  buildBody: () => { ok: true; body: unknown } | { ok: false; error: string };
  onSuccess?: () => void;
  describeSuccess: (result: T) => string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    const built = buildBody();
    if (!built.ok) {
      setError(built.error);
      setDone(null);
      return;
    }

    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(built.body),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? 'ثبت نشد. دوباره تلاش کنید.');
        return;
      }
      setDone(describeSuccess(payload as T));
      onSuccess?.();
      router.refresh();
    } catch {
      setError('ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید و دوباره بزنید.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-900">{title}</h2>
      <div className="mt-1.5 text-2xs leading-6 text-ink-700">{explain}</div>

      <div className="mt-5 space-y-4">{children}</div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-pomegranate-400/40 bg-pomegranate-300/15 px-3 py-2 text-2xs leading-6 text-pomegranate-600"
        >
          {error}
        </p>
      ) : null}
      {done ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-forest-500/40 bg-forest-300/15 px-3 py-2 text-2xs leading-6 text-forest-700"
        >
          {done}
        </p>
      ) : null}

      <button type="submit" className="btn-primary mt-5 w-full sm:w-auto" disabled={busy || disabled}>
        {busy ? 'در حال ثبت…' : submitLabel}
      </button>
    </form>
  );
}
