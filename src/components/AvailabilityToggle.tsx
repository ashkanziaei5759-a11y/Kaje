'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const OPTIONS = [
  ['AVAILABLE', 'موجود'],
  ['UNAVAILABLE', 'ناموجود'],
  ['HIDDEN', 'مخفی'],
] as const;

export function AvailabilityToggle({
  menuItemId, availability, autoSoldOut,
}: {
  menuItemId: string;
  availability: string;
  autoSoldOut: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(availability);
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);

    const response = await fetch(`/api/menu-items/${menuItemId}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availability: next }),
    });

    setSaving(false);
    if (!response.ok) {
      setValue(previous); // put the control back where it was
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {autoSoldOut && (
        <span className="text-2xs text-ink-600" title="در صورت اتمام موجودی، خودکار ناموجود می‌شود">
          خودکار
        </span>
      )}
      <div className="flex gap-0.5 rounded-lg border border-ink-800 bg-ink-850 p-0.5">
        {OPTIONS.map(([option, label]) => (
          <button
            key={option}
            onClick={() => change(option)}
            disabled={saving}
            aria-pressed={value === option}
            className={`rounded-md px-2.5 py-1 text-2xs transition-colors ${
              value === option
                ? option === 'AVAILABLE'
                  ? 'bg-pistachio-500 text-ink-950 font-semibold'
                  : option === 'UNAVAILABLE'
                    ? 'bg-pomegranate-500 text-white font-semibold'
                    : 'bg-ink-600 text-ink-100 font-semibold'
                : 'text-ink-500 hover:text-ink-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
