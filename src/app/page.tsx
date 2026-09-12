import Link from 'next/link';
import type { Metadata } from 'next';
import { DEMO_MODE } from '@/lib/db';

export const metadata: Metadata = {
  title: 'کاژه — مدیریت رستوران و سودآوری',
};

const DOORS = [
  {
    href: '/menu',
    title: 'منوی دیجیتال',
    body: 'همان چیزی که مهمان روی گوشی می‌بیند. با اسکن QR باز می‌شود و می‌شود مثل یک اپ روی صفحهٔ خانه نصبش کرد.',
    cta: 'دیدن منو',
    tone: 'from-forest-600 to-forest-500',
  },
  {
    href: '/login',
    title: 'پنل مدیریت',
    body: 'قیمت تمام‌شدهٔ هر غذا، درصد سود، انبار لحظه‌ای، دستور پخت، گزارش‌ها و مهندسی منو.',
    cta: 'ورود به پنل',
    tone: 'from-azure-600 to-azure-500',
  },
] as const;

export default function Home() {
  return (
    <main dir="rtl" className="mx-auto flex min-h-[100svh] max-w-5xl flex-col justify-center px-5 py-16">
      <header className="mb-10">
        <p className="text-sm font-medium tracking-wide text-forest-700">Kajeh</p>
        <h1 className="mt-1 text-4xl font-bold text-ink-900 sm:text-5xl">کاژه</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-ink-700">
          سامانهٔ مدیریت رستوران و سودآوری. برای هر غذا دقیقاً می‌گوید چقدر تمام می‌شود،
          چند درصد سود دارد، چرا این‌قدر هزینه دارد، و قیمت فروش پیشنهادی‌اش چقدر است.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        {DOORS.map((door) => (
          <Link
            key={door.href}
            href={door.href}
            className="card group flex flex-col gap-3 p-6 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2"
          >
            <span className={`inline-block h-1 w-12 rounded-full bg-gradient-to-l ${door.tone}`} />
            <h2 className="text-xl font-semibold text-ink-900">{door.title}</h2>
            <p className="text-sm leading-7 text-ink-700">{door.body}</p>
            <span className="mt-auto pt-2 text-sm font-medium text-forest-700 group-hover:underline">
              {door.cta} ←
            </span>
          </Link>
        ))}
      </div>

      {DEMO_MODE && (
        <section className="card mt-6 p-6">
          <h2 className="text-sm font-semibold text-ink-900">ورود آزمایشی</h2>
          <p className="mt-2 text-sm leading-7 text-ink-700">
            با نقش‌های مختلف وارد شوید تا سطح دسترسی‌ها را ببینید. رمز همه:{' '}
            <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[13px]">Kajeh@1404</code>
          </p>
          <ul className="mt-3 grid gap-1.5 text-sm text-ink-700 sm:grid-cols-2">
            <li><code className="font-mono text-[13px]">owner@kajeh.ir</code> — مالک، دسترسی کامل</li>
            <li><code className="font-mono text-[13px]">manager@kajeh.ir</code> — مدیر</li>
            <li><code className="font-mono text-[13px]">accountant@kajeh.ir</code> — حسابدار</li>
            <li><code className="font-mono text-[13px]">kitchen@kajeh.ir</code> — آشپزخانه</li>
            <li><code className="font-mono text-[13px]">inventory@kajeh.ir</code> — انباردار</li>
          </ul>
        </section>
      )}
    </main>
  );
}
