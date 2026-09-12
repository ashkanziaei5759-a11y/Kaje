import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegistrar } from '@/components/menu/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: { default: 'کاژه | مدیریت رستوران', template: '%s | کاژه' },
  description:
    'سامانه مدیریت رستوران کاژه — قیمت تمام‌شده، سودآوری، انبار، دستور پخت و منوی دیجیتال',
  manifest: '/manifest.webmanifest',
  applicationName: 'کاژه',
  appleWebApp: {
    capable: true,
    title: 'کاژه',
    // Lets the menu draw behind the iOS status bar once installed.
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: {
    // Stops iOS turning prices and Persian digits into tappable phone links.
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#F2F7F4',
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays enabled: disabling it fails WCAG 1.4.4 and hurts anyone
  // who needs to enlarge the text.
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
