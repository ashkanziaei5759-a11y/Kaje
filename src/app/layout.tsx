import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'کاژه | مدیریت رستوران', template: '%s | کاژه' },
  description:
    'سامانه مدیریت رستوران کاژه — قیمت تمام‌شده، سودآوری، انبار، دستور پخت و منوی دیجیتال',
};

export const viewport: Viewport = {
  themeColor: '#0B0E13',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
