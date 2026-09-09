'use client';

import { useEffect, useState } from 'react';
import { PlusSquareIcon, ShareIcon, CloseIcon, DownloadIcon } from './icons';

/**
 * "Add to home screen" prompt.
 *
 * Two paths, because the platforms differ fundamentally:
 *
 *  - Chromium fires `beforeinstallprompt`, which we capture and replay when the
 *    diner taps our own button. Calling prompt() outside a user gesture is
 *    ignored, so the event has to be stored rather than used immediately.
 *  - iOS Safari has no install API at all. The only route is Share → Add to
 *    Home Screen, so there we show instructions instead of a button that
 *    could not work.
 *
 * A dismissal is remembered so the prompt does not badger someone who has
 * already said no.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'kajeh:install-dismissed';
const DISMISS_DAYS = 30;

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    // Already installed — nothing to offer.
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS reports installed state on navigator, not via display-mode.
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    if (wasRecentlyDismissed()) return;

    const iOS =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !/crios|fxios/i.test(navigator.userAgent);
    setIsIOS(iOS);

    if (iOS) {
      // No install event on iOS; surface the instructions after a short delay
      // so the prompt does not land before the menu has even rendered.
      const timer = setTimeout(() => setIsVisible(true), 4000);
      return () => clearTimeout(timer);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault(); // stop Chrome's own mini-infobar
      setDeferred(event as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    const onInstalled = () => {
      setIsVisible(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setIsVisible(false);
    setShowIOSHelp(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode blocks storage; the prompt simply reappears next visit.
    }
  }

  async function install() {
    if (isIOS) {
      setShowIOSHelp(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setIsVisible(false);
    setDeferred(null);
  }

  if (!isVisible) return null;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-[slideUp_320ms_ease-out]"
        role="region"
        aria-label="افزودن منو به صفحه اصلی"
      >
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-saffron-400/30 bg-ink-850/95 p-3 shadow-2xl backdrop-blur">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-saffron-400 text-lg font-extrabold text-ink-950">
            ک
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-50">منوی کاژه روی گوشی</p>
            <p className="mt-0.5 text-2xs leading-5 text-ink-400">
              نصب کنید تا بدون اینترنت هم منو را داشته باشید.
            </p>
          </div>

          <button
            onClick={install}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-saffron-400 px-4 text-2xs font-bold text-ink-950 transition-colors hover:bg-saffron-300 active:scale-95"
          >
            <DownloadIcon className="size-4" />
            نصب
          </button>

          <button
            onClick={dismiss}
            aria-label="بستن"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-300"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      </div>

      {showIOSHelp && (
        <div
          className="fixed inset-0 z-50 grid place-items-end bg-ink-950/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          onClick={dismiss}
        >
          <div
            className="mx-auto w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ios-install-title" className="text-base font-bold text-ink-50">
              افزودن به صفحه اصلی
            </h2>
            <p className="mt-1 text-2xs text-ink-400">
              در سافاری، دو مرحله ساده:
            </p>

            <ol className="mt-4 space-y-3">
              <li className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-800 text-saffron-400">
                  <ShareIcon className="size-5" />
                </span>
                <p className="text-sm text-ink-200">
                  <span className="tabular text-ink-500">۱.</span> دکمه اشتراک‌گذاری
                  را در پایین صفحه بزنید
                </p>
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-800 text-saffron-400">
                  <PlusSquareIcon className="size-5" />
                </span>
                <p className="text-sm text-ink-200">
                  <span className="tabular text-ink-500">۲.</span> گزینه «Add to Home
                  Screen» را انتخاب کنید
                </p>
              </li>
            </ol>

            <button onClick={dismiss} className="mt-5 min-h-11 w-full rounded-xl bg-ink-800 text-sm font-medium text-ink-100 transition-colors hover:bg-ink-700">
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function wasRecentlyDismissed(): boolean {
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) return false;
    const elapsedDays = (Date.now() - Number(stored)) / 86_400_000;
    return elapsedDays < DISMISS_DAYS;
  } catch {
    return false;
  }
}
