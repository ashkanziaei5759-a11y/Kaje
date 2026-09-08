import { redirect } from 'next/navigation';
import { getLiveSession } from '@/lib/auth/guard';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'ورود' };

export default async function LoginPage() {
  // Live check, not just a token check: a JWT whose user no longer exists
  // must land on the form rather than redirecting into a guard that bounces back.
  if (await getLiveSession()) redirect('/dashboard');

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel — the charcoal grill, rendered as light on ink. */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-ink-900 border-l border-ink-800 overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-32 -left-32 size-[28rem] rounded-full bg-saffron-400/10 blur-3xl"
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-saffron-400 text-ink-950 text-xl font-extrabold">
              ک
            </span>
            <div>
              <p className="text-lg font-bold text-ink-50">کاژه</p>
              <p className="text-2xs text-ink-400 tracking-widest">KAJEH</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="text-3xl font-bold leading-relaxed text-ink-50">
            هر غذا دقیقاً چقدر
            <span className="text-saffron-400"> تمام می‌شود</span>؟
          </p>
          <p className="mt-4 text-sm leading-7 text-ink-400">
            از فاکتور خرید تا موجودی انبار، دستور پخت، قیمت تمام‌شده و سود هر پرس —
            یک زنجیره به‌هم‌پیوسته که همیشه جواب دارد.
          </p>
        </div>

        <p className="relative text-2xs text-ink-600">
          سامانه مدیریت و سودآوری رستوران
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-saffron-400 text-ink-950 text-lg font-extrabold">
              ک
            </span>
            <p className="text-lg font-bold">کاژه</p>
          </div>

          <h1 className="text-xl font-bold text-ink-50">ورود به پنل مدیریت</h1>
          <p className="mt-1.5 text-sm text-ink-400">برای ادامه وارد حساب خود شوید.</p>

          <LoginForm />

          <div className="mt-8 rounded-lg border border-ink-800 bg-ink-900 p-3">
            <p className="label mb-2">حساب نمایشی</p>
            <p className="text-2xs text-ink-400 leading-6">
              <span className="text-ink-200">owner@kajeh.ir</span> — رمز:{' '}
              <span className="text-ink-200">Kajeh@1404</span>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
