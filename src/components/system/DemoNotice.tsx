import { DEMO_MODE } from '@/lib/db';

/**
 * Demo builds run PostgreSQL in-process, so anything written here lives only
 * as long as the serverless instance that served the request. Saying so up
 * front is fairer than letting someone enter a week of purchases and lose them.
 */
export function DemoNotice() {
  if (!DEMO_MODE) return null;
  return (
    <div
      dir="rtl"
      className="sticky top-0 z-50 border-b border-amber-400/40 bg-amber-50/85 px-4 py-2 text-center text-[13px] leading-6 text-amber-950 backdrop-blur-md"
      role="status"
    >
      <strong className="font-semibold">نسخهٔ نمایشی</strong>
      {' — '}
      همهٔ داده‌ها واقعی و کامل‌اند و می‌توانید همه‌چیز را ویرایش کنید، اما پایگاه‌داده
      در همین سرور اجرا می‌شود و تغییرها ماندگار نیستند. برای نسخهٔ دائمی کافی است
      یک <code className="rounded bg-amber-200/60 px-1 font-mono text-[12px]">DATABASE_URL</code> تنظیم شود.
    </div>
  );
}
