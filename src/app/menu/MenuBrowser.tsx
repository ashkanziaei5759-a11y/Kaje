'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import type { PublicMenu } from '@/server/services/menu';
import { formatCurrency } from '@/lib/format';
import {
  CategoryIcon, SearchIcon, PhoneIcon, LocationIcon, StarIcon, CloseIcon,
} from '@/components/menu/icons';
import { InstallPrompt } from '@/components/menu/InstallPrompt';

/**
 * The customer-facing menu.
 *
 * Built for one situation: someone at a table, on a phone, on patchy data,
 * deciding what to eat. That drives every choice here — a single scroll with a
 * sticky category rail rather than nested navigation, search that filters
 * instantly against an already-loaded payload, and prices that stay legible at
 * arm's length.
 */
export function MenuBrowser({ menu }: { menu: PublicMenu }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const symbol = menu.restaurant.currencySymbol;

  useEffect(() => {
    if (isSearchOpen) searchRef.current?.focus();
  }, [isSearchOpen]);

  const featured = useMemo(
    () => menu.categories.flatMap((c) => c.items).filter((i) => i.isFeatured && i.isAvailable),
    [menu],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return menu.categories
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
  }, [menu, query]);

  const totalMatches = visible.reduce((n, c) => n + c.items.length, 0);

  /** Category taps scroll rather than filter, so the menu stays one document. */
  function goToCategory(categoryId: string) {
    setActiveCategory(categoryId);
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen bg-ink-50 pb-28">
      {/* Masthead */}
      <header className="relative overflow-hidden border-b border-ink-200/80">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(232,163,61,0.18),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-2xl px-5 pb-7 pt-[max(2rem,env(safe-area-inset-top))] text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-forest-500 text-3xl font-extrabold text-ink-50 shadow-lg shadow-forest-500/20">
            ک
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
            {menu.restaurant.namePersian}
          </h1>
          <p className="mt-1.5 text-2xs font-medium tracking-[0.35em] text-forest-500">
            KAJEH
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {menu.restaurant.phone && (
              <a
                href={`tel:${menu.restaurant.phone.replace(/[^\d+]/g, '')}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-500 px-5 text-sm font-bold text-ink-50 transition-transform hover:bg-forest-400 active:scale-95"
              >
                <PhoneIcon className="size-4" />
                تماس و سفارش
              </a>
            )}
            {menu.restaurant.address && (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink-200 px-4 text-2xs text-ink-600">
                <LocationIcon className="size-4 shrink-0" />
                <span className="max-w-[16rem] truncate">{menu.restaurant.address}</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Sticky category rail + search */}
      <div className="sticky top-0 z-30 border-b border-ink-200/80 bg-ink-50/95 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-3 py-2.5">
          {isSearchOpen ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <SearchIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-600" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="نام غذا را بنویسید…"
                  aria-label="جستجو در منو"
                  className="h-11 w-full rounded-xl border border-ink-300 bg-ink-0 pr-10 pl-3 text-sm text-ink-900 placeholder:text-ink-600 focus:border-forest-500 focus:outline-none"
                />
              </div>
              <button
                onClick={() => { setIsSearchOpen(false); setQuery(''); }}
                aria-label="بستن جستجو"
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink-0 text-ink-600 transition-colors hover:text-ink-800"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSearchOpen(true)}
                aria-label="جستجو در منو"
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink-0 text-ink-600 transition-colors hover:bg-ink-200 hover:text-forest-500"
              >
                <SearchIcon className="size-5" />
              </button>

              <div className="flex flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {menu.categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => goToCategory(category.id)}
                    aria-pressed={activeCategory === category.id}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-2xs font-medium transition-colors ${
                      activeCategory === category.id
                        ? 'bg-forest-500 text-ink-50'
                        : 'bg-ink-0 text-ink-600 hover:bg-ink-200'
                    }`}
                  >
                    <CategoryIcon name={category.name} className="size-4" />
                    {category.namePersian}
                  </button>
                ))}
              </div>
            </div>
          )}

          {query && (
            <p className="mt-2 px-1 text-2xs text-ink-600" role="status">
              {totalMatches === 0
                ? 'غذایی با این نام پیدا نشد'
                : `${totalMatches.toLocaleString('fa-IR')} غذا پیدا شد`}
            </p>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4">
        {/* Featured — hidden while searching, where it would be noise. */}
        {featured.length > 0 && !query && (
          <section className="pt-6">
            <div className="mb-3 flex items-center gap-2">
              <StarIcon className="size-4 text-forest-500" />
              <h2 className="text-sm font-bold text-ink-800">پیشنهاد کاژه</h2>
            </div>
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {featured.map((item) => (
                <article
                  key={item.id}
                  className="w-60 shrink-0 snap-start overflow-hidden rounded-2xl border border-forest-500/25 bg-gradient-to-br from-forest-500/12 via-ink-0 to-ink-0"
                >
                  {item.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.imageUrl}
                      alt={item.namePersian}
                      loading="lazy"
                      /* Width and height are declared so the row does not jump
                         as photos load — a shifting menu is hard to tap. */
                      width={240}
                      height={150}
                      className="h-32 w-full object-cover"
                    />
                  )}
                  <div className="p-4">
                  <h3 className="font-bold text-ink-900">{item.namePersian}</h3>
                  {item.description && (
                    <p className="mt-1.5 line-clamp-2 text-2xs leading-5 text-ink-600">
                      {item.description}
                    </p>
                  )}
                  <p className="mt-3 tabular text-lg font-bold text-forest-500">
                    {formatCurrency(item.price, { symbol })}
                  </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {visible.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-sm text-ink-600">غذایی با این نام پیدا نشد.</p>
            <button
              onClick={() => setQuery('')}
              className="mt-3 min-h-11 rounded-xl bg-ink-0 px-5 text-2xs text-ink-600 hover:bg-ink-200"
            >
              نمایش همه غذاها
            </button>
          </div>
        ) : (
          visible.map((category) => (
            <section
              key={category.id}
              ref={(node) => { sectionRefs.current[category.id] = node; }}
              className="scroll-mt-[4.5rem] pt-8"
            >
              <div className="flex items-baseline justify-between gap-3 border-b border-ink-200 pb-2.5">
                <h2 className="flex items-center gap-2.5 text-lg font-bold text-ink-900">
                  <CategoryIcon name={category.name} className="size-5 text-forest-500" />
                  {category.namePersian}
                </h2>
                {category.servingWindow && (
                  <span
                    className={`shrink-0 rounded-lg px-2 py-1 text-2xs tabular ${
                      category.isServingNow
                        ? 'text-ink-600'
                        : 'bg-forest-500/10 text-forest-500'
                    }`}
                    dir="ltr"
                  >
                    {category.servingWindow}
                  </span>
                )}
              </div>

              {!category.isServingNow && (
                <p className="mt-2 text-2xs text-forest-500/80">
                  خارج از ساعت سرو این بخش هستیم.
                </p>
              )}

              <ul className="divide-y divide-ink-100">
                {category.items.map((item) => {
                  const isServed = item.isAvailable && category.isServingNow;
                  return (
                    <li key={item.id} className={`py-4 ${isServed ? '' : 'opacity-50'}`}>
                      <div className="flex items-start gap-3">
                        {item.imageUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={item.imageUrl}
                            alt={item.namePersian}
                            loading="lazy"
                            width={80}
                            height={80}
                            className="size-20 shrink-0 rounded-xl object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="font-semibold leading-snug text-ink-900">
                              {item.namePersian}
                            </h3>
                            {!item.isAvailable && (
                              <span className="rounded-md bg-pomegranate-500/15 px-2 py-0.5 text-2xs font-medium text-pomegranate-400">
                                تمام شد
                              </span>
                            )}
                            {item.isFeatured && item.isAvailable && (
                              <StarIcon className="size-3.5 text-forest-500" />
                            )}
                          </div>

                          {item.description && (
                            <p className="mt-1.5 text-2xs leading-6 text-ink-600">
                              {item.description}
                            </p>
                          )}

                          {item.modifiers.length > 0 && (
                            <ul className="mt-2.5 flex flex-wrap gap-1.5">
                              {item.modifiers.map((modifier) => (
                                <li
                                  key={modifier.id}
                                  className="rounded-lg bg-ink-0 px-2 py-1 text-2xs text-ink-600"
                                >
                                  {modifier.name}
                                  <span className="mr-1 tabular text-ink-600">
                                    +{formatCurrency(modifier.priceDelta)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          {item.allergens.length > 0 && (
                            <p className="mt-2 text-2xs text-ink-400">
                              حاوی: {item.allergens.join('، ')}
                            </p>
                          )}
                        </div>

                        <p className="shrink-0 pt-0.5 tabular text-base font-bold text-forest-500">
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

      <footer className="mt-10 border-t border-ink-200 px-4 py-8 text-center">
        <p className="text-2xs leading-6 text-ink-600">
          قیمت‌ها به {symbol} و شامل مالیات بر ارزش افزوده است.
        </p>
        {menu.restaurant.phone && (
          <a
            href={`tel:${menu.restaurant.phone.replace(/[^\d+]/g, '')}`}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink-200 px-5 text-2xs text-ink-600 hover:border-forest-500 hover:text-forest-500"
          >
            <PhoneIcon className="size-4" />
            {menu.restaurant.phone}
          </a>
        )}
        <p className="mt-4 text-2xs text-ink-300">{menu.restaurant.namePersian}</p>
      </footer>

      <InstallPrompt />
    </div>
  );
}
