'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@kajeh.ir');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? 'ورود ناموفق بود. دوباره تلاش کنید.');
      return;
    }
    startTransition(() => {
      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="label mb-1.5 block">ایمیل</label>
        <input
          id="email" type="email" required autoComplete="email" dir="ltr"
          className="input text-left"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="password" className="label mb-1.5 block">رمز عبور</label>
        <input
          id="password" type="password" required autoComplete="current-password" dir="ltr"
          className="input text-left"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-pomegranate-500/30 bg-pomegranate-500/10 px-3 py-2 text-2xs text-pomegranate-400">
          {error}
        </p>
      )}

      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending ? 'در حال ورود…' : 'ورود'}
      </button>
    </form>
  );
}
