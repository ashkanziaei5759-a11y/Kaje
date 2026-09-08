'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/format';

/**
 * Manual price override.
 *
 * The spec's rule: the manager's typed price always wins over the engine's
 * recommendation. "Accept the recommendation" is offered as an explicit action
 * rather than happening silently, so a price never changes without someone
 * choosing it.
 */
export function PriceEditor({
  menuItemId, currentPrice, recommendedPrice, isOverridden, symbol,
}: {
  menuItemId: string;
  currentPrice: string;
  recommendedPrice: string;
  isOverridden: boolean;
  symbol: string;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(String(Math.round(Number(currentPrice))));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function save(value: string, override: boolean) {
    setStatus('saving');
    setMessage(null);

    const response = await fetch(`/api/menu-items/${menuItemId}/price`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellingPrice: value, priceIsOverridden: override }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatus('error');
      setMessage(body.error ?? 'ذخیره قیمت انجام نشد.');
      return;
    }
    setStatus('saved');
    setMessage('قیمت ذخیره شد.');
    router.refresh();
  }

  const recommendedRounded = String(Math.round(Number(recommendedPrice)));
  const matchesRecommendation = price === recommendedRounded;

  return (
    <div>
      <label htmlFor="price" className="label mb-1.5 block">
        قیمت فروش {isOverridden && <span className="text-saffron-400">(دستی)</span>}
      </label>
      <div className="flex gap-2">
        <input
          id="price" type="number" inputMode="numeric" min={0} step={1000} dir="ltr"
          className="input text-left tabular"
          value={price}
          onChange={(e) => { setPrice(e.target.value); setStatus('idle'); }}
        />
        <button
          onClick={() => save(price, true)}
          disabled={status === 'saving' || price === ''}
          className="btn-primary shrink-0"
        >
          {status === 'saving' ? '…' : 'ذخیره'}
        </button>
      </div>

      {!matchesRecommendation && (
        <button
          onClick={() => { setPrice(recommendedRounded); save(recommendedRounded, false); }}
          disabled={status === 'saving'}
          className="mt-2 w-full rounded-lg border border-saffron-400/30 bg-saffron-400/10 px-3 py-2 text-2xs text-saffron-300 hover:bg-saffron-400/20 transition-colors"
        >
          پذیرفتن قیمت پیشنهادی: {formatCurrency(recommendedPrice, { symbol })}
        </button>
      )}

      {message && (
        <p
          role="status"
          className={`mt-2 text-2xs ${status === 'error' ? 'text-pomegranate-400' : 'text-pistachio-400'}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
