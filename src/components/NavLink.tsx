'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, label, compact = false }: { href: string; label: string; compact?: boolean }) {
  const pathname = usePathname();
  // Mark the section active for nested routes too (/menu-items/abc).
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={
        compact
          ? `block whitespace-nowrap rounded-lg px-3 py-1.5 text-2xs transition-colors ${
              isActive ? 'bg-forest-500 text-ink-50 font-semibold' : 'text-ink-600 hover:bg-ink-200'
            }`
          : `block rounded-lg px-2.5 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-ink-200 text-forest-500 font-medium'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-800'
            }`
      }
    >
      {label}
    </Link>
  );
}
