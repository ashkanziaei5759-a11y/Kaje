import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';

export function KpiCard({
  label, value, sub, tone = 'default', icon, href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'positive' | 'warning' | 'negative' | 'accent';
  icon?: ReactNode;
  href?: string;
}) {
  const toneClass = {
    default: 'text-ink-50',
    positive: 'text-pistachio-400',
    warning: 'text-saffron-400',
    negative: 'text-pomegranate-400',
    accent: 'text-saffron-400',
  }[tone];

  const body = (
    <div className="card card-hover p-4 h-full">
      <div className="flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        {icon && <span className="text-ink-500 shrink-0">{icon}</span>}
      </div>
      <div className={`mt-2 text-xl font-bold tabular ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-2xs text-ink-400">{sub}</div>}
    </div>
  );

  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function Badge({
  children, tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'accent';
}) {
  const toneClass = {
    neutral: 'bg-ink-800 text-ink-300 border-ink-700',
    positive: 'bg-pistachio-500/15 text-pistachio-400 border-pistachio-500/30',
    warning: 'bg-saffron-400/15 text-saffron-400 border-saffron-400/30',
    negative: 'bg-pomegranate-500/15 text-pomegranate-400 border-pomegranate-500/30',
    accent: 'bg-saffron-400/15 text-saffron-300 border-saffron-400/30',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-sm font-medium text-ink-200">{title}</p>
      {hint && <p className="mt-1 text-2xs text-ink-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Money({
  value, symbol, compact, className = '',
}: { value: string | number; symbol?: string; compact?: boolean; className?: string }) {
  return <span className={`tabular ${className}`}>{formatCurrency(value, { symbol, compact })}</span>;
}

export function Percent({
  value, target, className = '',
}: { value: string | number; target?: number; className?: string }) {
  const n = Number(value);
  const tone =
    target === undefined ? '' :
    n <= 0 ? 'text-pomegranate-400' :
    n < target ? 'text-saffron-400' : 'text-pistachio-400';
  return <span className={`tabular ${tone} ${className}`}>{formatPercent(value)}</span>;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px]">{children}</table>
    </div>
  );
}

export function Num({ children }: { children: string | number }) {
  return <span className="tabular">{faDigits(children)}</span>;
}
