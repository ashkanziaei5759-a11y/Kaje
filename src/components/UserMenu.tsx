'use client';

import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'مالک', MANAGER: 'مدیر', ACCOUNTANT: 'حسابدار',
  KITCHEN: 'آشپزخانه', WAITER: 'سالن‌دار', INVENTORY_MANAGER: 'انباردار',
};

export function UserMenu({ name, role }: { name: string; role: string }) {
  const router = useRouter();

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-ink-800">{name}</p>
        <p className="text-2xs text-ink-600">{ROLE_LABELS[role] ?? role}</p>
      </div>
      <button
        onClick={signOut}
        className="shrink-0 rounded-lg px-2 py-1 text-2xs text-ink-600 hover:bg-ink-200 hover:text-ink-700 transition-colors"
      >
        خروج
      </button>
    </div>
  );
}
