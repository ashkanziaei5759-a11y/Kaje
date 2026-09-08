'use client';

import { useMemo, useState } from 'react';
import type { PublicMenu } from '@/server/services/menu';
import { formatCurrency } from '@/lib/format';

/**
 * The customer-facing menu.
 *
 * Mobile-first and RTL. No account, no ordering — a printed menu that happens
 * to be current. Search and category filtering run client-side over a payload
 * that is already small, so filtering is instant on a phone at a table.
 */
export function MenuBrowser({ menu }: { menu: PublicMenu }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const symbol = menu.restaurant.currencySymbol;

  const featured = useMemo(
    () => menu.categories.flatMap((c) => c.items).filter((i) => i.isFeatured && i.isAvailable),
    [menu],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return menu.categories
      .filter((c) => !activeCategory || c.id === activeCategory)
      .map((category) => ({
        ...category,
        items: needle
          ? category.items.filter(
              (item) =>
                item.namePersian.toLowerCase().includes(needle) ||
                item.name.toLowerCase().includes(needle) ||
                (item.description ?? '').toLowerCase().includes(needle),
            )
          : category.items,
      }))
      .filter((category) => category.items.length > 0);
  }, [menu, query, activeCategory]);

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Masthead */}
      <header className="relative overflow-hidden border-b border-ink-800 bg-ink-900">
        <div
          aria-hidden
          className="absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-saffron-400/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-5 py-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-saffron-400 text-2xl font-extrabold text-ink-950">
            ک
          </span>
          <h1 className="mt-4 text-3xl font-bold text-ink-50">{menu.restaurant.namePersian}</h1>
          <p className="mt-1 text-2xs tracking-[0.3em] text-saffron-400">KAJEH</p>
          {menu.restaurant.address && (
            <p className="mt-4 text-2xs leading-6 text-ink-400">{menu.restaurant.address}</p>
          )}
          {menu.restaurant.phone && (
            <a
              href={`tel:${menu.restaurant.phone.replace(/[^\d+]/g, '')}`}
              className="mt-3 inline-block rounded-lg border border-ink-700 px-4 py-2 text-2xs text-ink-200 hover:border-saffron-400 hover:text-saffron-400 transition-colors"
            >
              تماس و سفارش: {menu.restaurant.phone}
            </a>
          )}
        </div>
      </header>

      {/* Sticky search + category rail */}
      <div className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <label htmlFor="menu-search" className="sr-only">جستجو در منو</label>
          <input
            id="menu-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی غذا…"
            className="w-full rounded-xl border border-ink-800 bg-ink-900 px-4 py-2.5 text-sm text-ink-50 placeholder:text-ink-500 focus:border-saffron-400 focus:outline-none"
          />

          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
            <CategoryChip
              label="همه"
              isActive={activeCategory === null}
              onClick={() => setActiveCategory(null)}
            />
            {menu.categories.map((category) => (
              <CategoryChip
                key={category.id}
                label={`${category.icon ?? ''} ${category.namePersian}`.trim()}
                isActive={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        {/* Featured strip — only when browsing everything unfiltered. */}
        {featured.length > 0 && !query && activeCategory === null && (
          <section className="pt-6">
            <h2 className="mb-3 text-sm font-semibold text-ink-100">پیشنهاد کاژه</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {featured.map((item) => (
                <article
                  key={item.id}
                  className="w-56 shrink-0 rounded-xl border border-saffron-400/25 bg-gradient-to-b from-saffron-400/10 to-transparent p-4"
                >
                  <h3 className="font-semibold text-ink-50">{item.namePersian}</h3>
                  {item.description && (
                    <p className="mt-1.5 line-clamp-2 text-2xs leading-5 text-ink-400">
                      {item.description}
                    </p>
                  )}
                  <p className="mt-3 tabular font-bold text-saffron-400">
                    {formatCurrency(item.price, { symbol })}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {visible.length === 0 ? (
          <p className="py-20 text-center text-sm text-ink-500">
            غذایی با این نام پیدا نشد.
          </p>
        ) : (
          visible.map((category) => (
            <section key={category.id} className="pt-8">
              <div className="flex items-baseline justify-between gap-3 border-b border-ink-800 pb-2">
                <h2 className="text-lg font-bold text-ink-50">
                  {category.icon && <span className="ml-2">{category.icon}</span>}
                  {category.namePersian}
                </h2>
                {category.servingWindow && (
                  <span
                    className={`shrink-0 text-2xs ${
                      category.isServingNow ? 'text-ink-500' : 'text-saffron-400'
                    }`}
                    dir="ltr"
                  >
                    {category.servingWindow}
                    {!category.isServingNow && ' — خارج از ساعت سرو'}
                  </span>
                )}
              </div>

              <ul className="divide-y divide-ink-850">
                {category.items.map((item) => {
                  const isServed = item.isAvailable && category.isServingNow;
                  return (
                    <li key={item.id} className={`py-4 ${isServed ? '' : 'opacity-55'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-ink-50">{item.namePersian}</h3>
                            {!item.isAvailable && (
                              <span className="rounded-md border border-pomegranate-500/30 bg-pomegranate-500/15 px-2 py-0.5 text-2xs text-pomegranate-400">
                                تمام شد
                              </span>
                            )}
                            {item.isFeatured && item.isAvailable && (
                              <span className="rounded-md border border-saffron-400/30 bg-saffron-400/15 px-2 py-0.5 text-2xs text-saffron-300">
                                ویژه
                              </span>
                            )}
                          </div>

                          {item.description && (
                            <p className="mt-1.5 text-2xs leading-6 text-ink-400">{item.description}</p>
                          )}

                          {item.modifiers.length > 0 && (
                            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                              {item.modifiers.map((modifier) => (
                                <li key={modifier.id} className="text-2xs text-ink-500">
                                  {modifier.name}
                                  <span className="mr-1 tabular text-ink-400">
                                    +{formatCurrency(modifier.priceDelta)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          {item.allergens.length > 0 && (
                            <p className="mt-2 text-2xs text-ink-600">
                              حاوی: {item.allergens.join('، ')}
                            </p>
                          )}
                        </div>

                        <p className="shrink-0 tabular font-bold text-saffron-400">
                          {formatCurrency(item.price, { symbol })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>

      <footer className="border-t border-ink-800 py-8 text-center">
        <p className="text-2xs text-ink-600">
          قیمت‌ها به {symbol} و شامل مالیات بر ارزش افزوده است.
        </p>
        <p className="mt-1 text-2xs text-ink-700">{menu.restaurant.namePersian}</p>
      </footer>
    </div>
  );
}

function CategoryChip({
  label, isActive, onClick,
}: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={isActive}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-2xs transition-colors ${
        isActive
          ? 'bg-saffron-400 font-semibold text-ink-950'
          : 'border border-ink-800 bg-ink-900 text-ink-300 hover:border-ink-700'
      }`}
    >
      {label}
    </button>
  );
}
