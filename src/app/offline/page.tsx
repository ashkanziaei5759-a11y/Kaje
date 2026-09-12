export const metadata = { title: 'آفلاین' };

/**
 * Shown by the service worker when a navigation fails and nothing is cached.
 * Deliberately static and dependency-free so it renders from cache alone.
 */
export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-50 px-6 text-center">
      <div>
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-ink-200 text-3xl font-extrabold text-forest-500">
          ک
        </span>
        <h1 className="mt-5 text-xl font-bold text-ink-900">اتصال اینترنت قطع است</h1>
        <p className="mt-2 text-sm leading-7 text-ink-600">
          منو در حافظه گوشی ذخیره شده است.
          <br />
          پس از وصل شدن، آخرین قیمت‌ها و موجودی به‌روز می‌شود.
        </p>
        <a
          href="/menu"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-forest-500 px-6 text-sm font-bold text-ink-50"
        >
          تلاش دوباره
        </a>
      </div>
    </main>
  );
}
