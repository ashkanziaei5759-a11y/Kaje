'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * QR management.
 *
 * Downloads are produced client-side from data the server already rendered, so
 * the printed asset is byte-identical to the preview and no second round-trip
 * can hand back a different code.
 */
export function QrPanel({
  svg, png, url, label, scanCount, restaurantName,
}: {
  svg: string;
  png: string;
  url: string;
  label: string;
  scanCount: number;
  restaurantName: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  function download(content: string, filename: string, type: string) {
    const blob = type.startsWith('data:')
      ? null
      : new Blob([content], { type });
    const href = blob ? URL.createObjectURL(blob) : content;
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    if (blob) URL.revokeObjectURL(href);
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /** A print-ready A5 card: the QR plus the restaurant's name and a prompt. */
  function printCard() {
    const win = window.open('', '_blank', 'width=600,height=800');
    if (!win) return;
    win.document.write(`
      <!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
      <title>QR منوی ${restaurantName}</title>
      <style>
        @page { size: A5; margin: 12mm; }
        body { font-family: Vazirmatn, system-ui, sans-serif; text-align: center;
               display: flex; flex-direction: column; align-items: center;
               justify-content: center; height: 100vh; margin: 0; }
        h1 { font-size: 30px; margin: 0 0 4px; }
        p.brand { letter-spacing: .3em; color: #B4761B; font-size: 11px; margin: 0 0 28px; }
        .qr { width: 62mm; height: 62mm; }
        p.prompt { margin-top: 24px; font-size: 15px; color: #333; }
        p.url { margin-top: 6px; font-size: 10px; color: #888; direction: ltr; }
      </style></head><body>
        <h1>${restaurantName}</h1>
        <p class="brand">KAJEH</p>
        <div class="qr">${svg}</div>
        <p class="prompt">برای دیدن منو، کد را اسکن کنید</p>
        <p class="url">${url}</p>
        <script>window.onload = () => window.print();<\/script>
      </body></html>
    `);
    win.document.close();
  }

  async function regenerate() {
    if (!confirm(
      'کد جدید ساخته می‌شود و همه کدهای چاپ‌شده قبلی از کار می‌افتند. ادامه می‌دهید؟',
    )) return;

    setRegenerating(true);
    const response = await fetch('/api/qr/regenerate', { method: 'POST' });
    setRegenerating(false);
    if (response.ok) router.refresh();
  }

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-ink-100">{label}</h2>
      <p className="mt-0.5 text-2xs text-ink-500">
        {scanCount.toLocaleString('fa-IR')} بار اسکن شده
      </p>

      {/* White plate: a QR on a dark ground fails on many phone scanners. */}
      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="mx-auto w-full max-w-[15rem]" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>

      <div className="mt-3 rounded-lg border border-ink-800 bg-ink-850 p-2.5">
        <p className="label mb-1">نشانی منو</p>
        <p className="break-all text-2xs text-ink-300" dir="ltr">{url}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => download(png, 'kajeh-menu-qr.png', 'data:')} className="btn-ghost text-2xs">
          دانلود PNG
        </button>
        <button
          onClick={() => download(svg, 'kajeh-menu-qr.svg', 'image/svg+xml')}
          className="btn-ghost text-2xs"
        >
          دانلود SVG
        </button>
        <button onClick={printCard} className="btn-primary text-2xs">
          چاپ کارت میز
        </button>
        <button onClick={copyUrl} className="btn-ghost text-2xs">
          {copied ? 'کپی شد ✓' : 'کپی نشانی'}
        </button>
      </div>

      <button
        onClick={regenerate}
        disabled={regenerating}
        className="mt-2 w-full rounded-lg border border-pomegranate-500/30 px-3 py-2 text-2xs text-pomegranate-400 hover:bg-pomegranate-500/10 transition-colors"
      >
        {regenerating ? 'در حال ساخت…' : 'ساخت کد جدید'}
      </button>
    </section>
  );
}
